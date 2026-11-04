"""Datos semilla de desarrollo: `make seed` (python -m app.seed).

Idempotente: borra al usuario semilla con todo lo suyo (filas y archivos) y lo vuelve a
crear. Los monumentos se insertan o actualizan por slug. Usa los mismos servicios que la
API, así que país, estado y ciudad de cada parada salen del punto igual que en producción.
"""

import random
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, time, timedelta

from geoalchemy2 import WKTElement
from sqlalchemy import Engine, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.geo.locate import locate
from app.models import City, Country, Memory, Monument, Photo, User
from app.schemas import LonLat, MemoryIn, StopIn, TripIn, TripPatch
from app.seed import data
from app.seed.photos import render_photo
from app.services import me, memories, trips
from app.services.photos import (
    VARIANTS,
    delete_files_after_commit,
    photo_prefix,
    user_prefix,
    variant_key,
)
from app.storage import StorageBackend


@dataclass
class SeedReport:
    trips: int = 0
    stops: int = 0
    memories: int = 0
    photos: int = 0
    monuments: int = 0


def _point(lon: float, lat: float) -> WKTElement:
    return WKTElement(f"POINT({lon} {lat})", srid=4326)


def upsert_monuments(session: Session) -> dict[str, int]:
    for m in data.MONUMENTS:
        found = locate(session, lon=m.lon, lat=m.lat)
        if found is None:
            raise RuntimeError(f"Monumento fuera de todo país: {m.slug}")
        values = {
            "slug": m.slug,
            "name_es": m.name_es,
            "stamp_code": m.stamp_code,
            "kind": m.kind,
            "country_id": found.country.id,
            "subdivision_id": found.subdivision.id if found.subdivision else None,
            "city_id": found.city.id if found.city else None,
            "location": _point(m.lon, m.lat),
            "source": "seed",
            "source_ref": None,
        }
        session.execute(
            insert(Monument)
            .values(**values)
            .on_conflict_do_update(index_elements=["slug"], set_=values)
        )
    return {slug: id_ for slug, id_ in session.execute(select(Monument.slug, Monument.id))}


def _reset_user(session: Session, storage: StorageBackend) -> None:
    old = session.scalar(select(User).where(User.handle == data.HANDLE))
    if old is not None:
        # Filas en cascada desde users; los archivos se borran al confirmar.
        delete_files_after_commit(session, storage, user_prefix(old.id))
        session.delete(old)
        session.flush()


def _create_user(session: Session) -> User:
    name, iso3 = data.HOME_CITY
    home_city_id = session.scalar(
        select(City.id)
        .join(Country, Country.id == City.country_id)
        .where(City.name_es == name, Country.iso3 == iso3)
        .order_by(City.population.desc())
    )
    if home_city_id is None:
        raise RuntimeError(f"No encontré la ciudad de casa {name}. ¿Corriste make load-geo?")
    user = User(handle=data.HANDLE, display_name=data.DISPLAY_NAME, home_city_id=home_city_id)
    session.add(user)
    session.flush()
    return user


def _add_photos(
    session: Session,
    storage: StorageBackend,
    user: User,
    memory: Memory,
    stop: data.StopSeed,
    rng: random.Random,
) -> int:
    day_count = ((stop.departed_on or stop.arrived_on) - stop.arrived_on).days + 1
    for position in range(stop.photos):
        day = stop.arrived_on + timedelta(days=position * day_count // max(stop.photos, 1))
        taken_at = datetime.combine(day, time(9), tzinfo=UTC) + timedelta(
            minutes=rng.randint(0, 600)
        )
        lon = stop.lon + rng.uniform(-0.01, 0.01)
        lat = stop.lat + rng.uniform(-0.01, 0.01)
        rendered = render_photo(
            stop.place_name,
            f"{position + 1} de {stop.photos} · {day.isoformat()}",
            taken_at=taken_at,
            lon=lon,
            lat=lat,
            seed=rng.randint(0, 10_000),
        )
        photo_id = uuid.uuid4()
        key = photo_prefix(user.id, photo_id)
        for variant in VARIANTS:
            storage.save(variant_key(key, variant), getattr(rendered, variant), "image/jpeg")
        session.add(
            Photo(
                id=photo_id,
                user_id=user.id,
                memory_id=memory.id,
                position=position,
                storage_key=key,
                mime="image/jpeg",
                width=rendered.width,
                height=rendered.height,
                bytes=len(rendered.original),
                sha256=rendered.sha256,
                taken_at=taken_at,
                location=_point(lon, lat),
            )
        )
    return stop.photos


def _stop_in(stop: data.StopSeed) -> StopIn:
    return StopIn(
        place_name=stop.place_name,
        location=LonLat(lon=stop.lon, lat=stop.lat),
        visit_type=stop.visit_type,
        arrived_on=stop.arrived_on,
        departed_on=stop.departed_on,
        note=stop.note,
    )


def seed(engine: Engine, storage: StorageBackend, *, with_photos: bool = True) -> SeedReport:
    report = SeedReport()
    rng = random.Random(2025)
    with Session(engine) as session:
        if not session.execute(text("SELECT EXISTS (SELECT 1 FROM cities)")).scalar():
            raise RuntimeError("No hay datos geográficos. Corre make load-geo primero.")

        monument_ids = upsert_monuments(session)
        report.monuments = len(data.MONUMENTS)
        _reset_user(session, storage)
        user = _create_user(session)
        for iso3 in data.WISHLIST:
            me.add_wish(session, user, iso3)

        def add_memory(memory_in: MemoryIn, stop: data.StopSeed) -> Memory:
            memory = memories.create_memory(session, user, memory_in)
            report.memories += 1
            if with_photos:
                report.photos += _add_photos(session, storage, user, memory, stop, rng)
            return memory

        for trip_seed in data.TRIPS:
            trip = trips.create_trip(
                session,
                user,
                TripIn(
                    title=trip_seed.title,
                    summary=trip_seed.summary,
                    visibility=trip_seed.visibility,
                ),
            )
            report.trips += 1
            favorite = None
            for index, stop_seed in enumerate(trip_seed.stops):
                stop = trips.add_stop(session, user, trip.id, _stop_in(stop_seed))
                report.stops += 1
                if stop_seed.memory is None:
                    continue
                memory = add_memory(
                    MemoryIn(
                        stop_id=stop.id,
                        body=stop_seed.memory,
                        occurred_on=stop_seed.arrived_on,
                        monument_id=monument_ids.get(stop_seed.monument)
                        if stop_seed.monument
                        else None,
                    ),
                    stop_seed,
                )
                if index == trip_seed.favorite_stop:
                    favorite = memory.id
            if favorite is not None:
                trips.update_trip(session, user, trip.id, TripPatch(favorite_memory_id=favorite))

        for loose in data.LOOSE_MEMORIES:
            add_memory(
                MemoryIn(
                    place=_stop_in(loose.stop),
                    body=loose.stop.memory or "",
                    occurred_on=loose.stop.arrived_on,
                    visibility=loose.visibility,
                ),
                loose.stop,
            )
            report.trips += 1
            report.stops += 1

        session.commit()
    return report


def main() -> None:
    from app.db import get_engine
    from app.storage import get_storage

    started = datetime.now()
    report = seed(get_engine(), get_storage())
    seconds = (datetime.now() - started).total_seconds()
    print(
        f"Semillas listas en {seconds:.0f} s: usuario '{data.HANDLE}', {report.trips} viajes, "
        f"{report.stops} paradas, {report.memories} recuerdos, {report.photos} fotos y "
        f"{report.monuments} monumentos."
    )
