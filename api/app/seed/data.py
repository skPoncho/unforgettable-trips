"""Datos semilla de desarrollo, tomados de las maquetas (design/pantallas). Son ficticios.

Lo verificable en las maquetas se reproduce tal cual:
- 12 de 195 países (11 visitados y Panamá como escala): América 7, Europa 4, Asia 1.
- 12 de 32 estados de México, con Ciudad de México como casa.
- El viaje a Japón: 6 paradas, 14 días, 84 fotos, 4 monumentos y escala en Tocumen.
- Los viajes de la tira de Mi mapa (días y fotos) y los sellos del pasaporte con su año.
- Lista de deseos: Argentina, Marruecos, Islandia y Egipto. 412 fotos en total.

Las maquetas no cuadran entre sí en algunos totales (9 viajes contra 11 países, 18
monumentos contra 12 sellos): para cubrir Guatemala, Costa Rica, Colombia, España,
Francia, Portugal, Morelos y Veracruz se agregan viajes; esos totales salen de lo cargado.
"""

from dataclasses import dataclass
from datetime import date

from app.models import MonumentKind, Visibility, VisitType

HANDLE = "carlos"
DISPLAY_NAME = "Carlos Barrón"
HOME_CITY = ("Ciudad de México", "MEX")
WISHLIST = ("ARG", "MAR", "ISL", "EGY")


@dataclass(frozen=True)
class MonumentSeed:
    slug: str
    name_es: str
    stamp_code: str
    kind: MonumentKind
    lon: float
    lat: float


MONUMENTS = (
    # México: los 8 sellos del pasaporte de la maqueta...
    MonumentSeed("teotihuacan", "Teotihuacán", "TEO", MonumentKind.unesco, -98.8438, 19.6925),
    MonumentSeed("chichen-itza", "Chichén Itzá", "CHI", MonumentKind.unesco, -88.5678, 20.6843),
    MonumentSeed(
        "tulum",
        "Zona arqueológica de Tulum",
        "TUL",
        MonumentKind.archaeological,
        -87.4290,
        20.2147,
    ),
    MonumentSeed("palenque", "Palenque", "PAL", MonumentKind.unesco, -92.0463, 17.4838),
    MonumentSeed("monte-alban", "Monte Albán", "MA", MonumentKind.unesco, -96.7678, 17.0436),
    MonumentSeed(
        "centro-historico-puebla",
        "Centro histórico de Puebla",
        "PUE",
        MonumentKind.unesco,
        -98.1981,
        19.0433,
    ),
    MonumentSeed(
        "ciudad-de-guanajuato",
        "Ciudad de Guanajuato",
        "GTO",
        MonumentKind.unesco,
        -101.2566,
        21.0170,
    ),
    MonumentSeed(
        "hospicio-cabanas", "Hospicio Cabañas", "HC", MonumentKind.unesco, -103.3364, 20.6767
    ),
    # ...y los 4 sugeridos (sin visitar).
    MonumentSeed("el-tajin", "El Tajín", "TAJ", MonumentKind.unesco, -97.3780, 20.4478),
    MonumentSeed("calakmul", "Calakmul", "CAL", MonumentKind.unesco, -89.8106, 18.1053),
    MonumentSeed("paquime", "Paquimé", "PAQ", MonumentKind.unesco, -107.9500, 30.3700),
    MonumentSeed(
        "misiones-sierra-gorda",
        "Misiones de la Sierra Gorda",
        "SG",
        MonumentKind.unesco,
        -99.4728,
        21.2178,
    ),
    # Japón: los de la bitácora del viaje.
    MonumentSeed("senso-ji", "Templo Sensō-ji", "SEN", MonumentKind.other, 139.7967, 35.7148),
    MonumentSeed(
        "fushimi-inari", "Fushimi Inari-taisha", "INA", MonumentKind.other, 135.7727, 34.9671
    ),
    MonumentSeed("todai-ji", "Tōdai-ji", "TOD", MonumentKind.unesco, 135.8398, 34.6890),
    MonumentSeed(
        "cupula-bomba-atomica",
        "Cúpula de la Bomba Atómica",
        "GEN",
        MonumentKind.unesco,
        132.4536,
        34.3955,
    ),
)


@dataclass(frozen=True)
class StopSeed:
    place_name: str
    lon: float
    lat: float
    arrived_on: date
    departed_on: date | None = None
    visit_type: VisitType = VisitType.stay
    note: str | None = None
    # Un recuerdo por parada (si hay texto), con sus fotos.
    memory: str | None = None
    monument: str | None = None
    photos: int = 0


@dataclass(frozen=True)
class TripSeed:
    title: str
    visibility: Visibility
    stops: tuple[StopSeed, ...]
    summary: str | None = None
    # Índice de la parada cuyo recuerdo es el "momento favorito".
    favorite_stop: int | None = None


D = date

TRIPS = (
    TripSeed(
        "Japón",
        Visibility.public,
        summary="De Tokio a Hiroshima en tren bala, con templos, ciervos y mucho ramen.",
        favorite_stop=3,
        stops=(
            StopSeed(
                "Aeropuerto de Tocumen",
                -79.3835,
                9.0714,
                D(2025, 3, 8),
                visit_type=VisitType.stopover,
                note="3 h en Tocumen",
            ),
            StopSeed(
                "Tokio",
                139.6917,
                35.6895,
                D(2025, 3, 8),
                D(2025, 3, 11),
                memory="Llegamos de noche a Shinjuku y lo primero fue perdernos entre letreros "
                "de neón buscando el hotel. Primer ramen a la una de la mañana, pedido en "
                "una máquina expendedora.",
                monument="senso-ji",
                photos=26,
            ),
            StopSeed(
                "Hakone",
                139.0250,
                35.1950,
                D(2025, 3, 12),
                memory="Nublado todo el día. El Fuji apareció diez minutos desde el barco del "
                "lago Ashi y todo el barco se fue al mismo lado.",
                photos=9,
            ),
            StopSeed(
                "Kioto",
                135.7681,
                35.0116,
                D(2025, 3, 13),
                D(2025, 3, 16),
                memory="Subimos Fushimi Inari a las siete de la mañana para evitar a la gente. "
                "Arriba sólo había gatos y un señor barriendo hojas entre los toriis.",
                monument="fushimi-inari",
                photos=28,
            ),
            StopSeed(
                "Nara",
                135.8048,
                34.6851,
                D(2025, 3, 17),
                memory="Los ciervos te hacen reverencia… y luego te persiguen por la galleta. "
                "El Gran Buda del Tōdai-ji no cabe en ninguna foto.",
                monument="todai-ji",
                photos=8,
            ),
            StopSeed(
                "Osaka",
                135.5023,
                34.6937,
                D(2025, 3, 18),
                D(2025, 3, 19),
                memory="Dōtonbori de noche y takoyaki quemándonos la lengua. Osaka se siente "
                "más relajada y ruidosa que Tokio.",
                photos=7,
            ),
            StopSeed(
                "Hiroshima",
                132.4553,
                34.3853,
                D(2025, 3, 20),
                D(2025, 3, 21),
                memory="El día más silencioso del viaje. Por la tarde, ferry a Miyajima para "
                "ver el torii flotando con la marea alta.",
                monument="cupula-bomba-atomica",
                photos=6,
            ),
        ),
    ),
    TripSeed(
        "Oaxaca y Chiapas",
        Visibility.link,
        stops=(
            StopSeed(
                "Oaxaca de Juárez",
                -96.7266,
                17.0732,
                D(2024, 12, 20),
                D(2024, 12, 23),
                memory="Tlayudas en el mercado 20 de Noviembre y la tarde entera en Monte "
                "Albán viendo el valle.",
                monument="monte-alban",
                photos=24,
            ),
            StopSeed(
                "San Cristóbal de las Casas",
                -92.6376,
                16.7370,
                D(2024, 12, 24),
                D(2024, 12, 26),
                memory="Nochebuena con frío de montaña y ponche en el andador.",
                photos=17,
            ),
            StopSeed(
                "Palenque",
                -91.9826,
                17.5097,
                D(2024, 12, 27),
                D(2024, 12, 28),
                memory="Los saraguatos rugiendo entre la selva mientras subíamos el Templo de "
                "las Inscripciones.",
                monument="palenque",
                photos=20,
            ),
        ),
    ),
    TripSeed(
        "Cusco y Valle Sagrado",
        Visibility.public,
        stops=(
            StopSeed(
                "Cusco",
                -71.9675,
                -13.5320,
                D(2024, 7, 12),
                D(2024, 7, 15),
                memory="Mate de coca al llegar y caminar despacio: la altura no perdona.",
                photos=21,
            ),
            StopSeed(
                "Ollantaytambo",
                -72.2643,
                -13.2583,
                D(2024, 7, 16),
                D(2024, 7, 17),
                memory="Terrazas incas al amanecer y el tren a Aguas Calientes.",
                photos=14,
            ),
            StopSeed(
                "Machu Picchu",
                -72.5254,
                -13.1547,
                D(2024, 7, 18),
                D(2024, 7, 19),
                memory="La neblina se levantó justo cuando llegamos a la Puerta del Sol.",
                photos=22,
            ),
        ),
    ),
    TripSeed(
        "Roma y Florencia",
        Visibility.private,
        stops=(
            StopSeed(
                "Roma",
                12.4964,
                41.9028,
                D(2023, 10, 5),
                D(2023, 10, 10),
                memory="Un supplì por cuadra y el Panteón bajo la lluvia.",
                photos=41,
            ),
            StopSeed(
                "Florencia",
                11.2558,
                43.7696,
                D(2023, 10, 11),
                D(2023, 10, 14),
                memory="Atardecer desde el Piazzale Michelangelo con medio Florencia ahí.",
                photos=32,
            ),
        ),
    ),
    TripSeed(
        "Nueva York",
        Visibility.private,
        stops=(
            StopSeed(
                "Nueva York",
                -74.0060,
                40.7128,
                D(2022, 4, 8),
                D(2022, 4, 13),
                memory="Cruzamos el puente de Brooklyn a pie y regresamos en ferry.",
                photos=40,
            ),
        ),
    ),
    TripSeed(
        "Yucatán",
        Visibility.public,
        stops=(
            StopSeed(
                "Mérida",
                -89.5926,
                20.9674,
                D(2021, 11, 18),
                D(2021, 11, 19),
                memory="Cochinita pibil de desayuno y trova en el parque de Santa Lucía.",
                photos=12,
            ),
            StopSeed(
                "Valladolid",
                -88.2022,
                20.6896,
                D(2021, 11, 20),
                memory="Llegamos a Chichén Itzá antes que los autobuses.",
                monument="chichen-itza",
                photos=14,
            ),
            StopSeed(
                "Tulum",
                -87.4654,
                20.2114,
                D(2021, 11, 21),
                D(2021, 11, 22),
                memory="El Castillo de Tulum frente al mar turquesa, con iguanas por todas partes.",
                monument="tulum",
                photos=12,
            ),
        ),
    ),
    TripSeed(
        "Escapada de fin de semana",
        Visibility.private,
        stops=(
            StopSeed(
                "Teotihuacán",
                -98.8711,
                19.6857,
                D(2019, 4, 13),
                memory="Subir la Pirámide del Sol a las nueve, antes del calor.",
                monument="teotihuacan",
                photos=5,
            ),
            StopSeed(
                "Cuernavaca",
                -99.2216,
                18.9242,
                D(2019, 4, 14),
                memory="Comida larga en un jardín de Cuernavaca para cerrar el fin.",
                photos=3,
            ),
        ),
    ),
    TripSeed(
        "Puebla y Cholula",
        Visibility.link,
        stops=(
            StopSeed(
                "Puebla",
                -98.2063,
                19.0414,
                D(2022, 2, 19),
                D(2022, 2, 20),
                memory="Mole poblano y la Capilla del Rosario, que deslumbra de tanto oro.",
                monument="centro-historico-puebla",
                photos=4,
            ),
            StopSeed(
                "Cholula",
                -98.3069,
                19.0633,
                D(2022, 2, 20),
                memory="El Popocatépetl humeando detrás de la iglesia sobre la pirámide.",
                photos=3,
            ),
        ),
    ),
    TripSeed(
        "Bajío en carretera",
        Visibility.public,
        stops=(
            StopSeed(
                "Querétaro",
                -100.3899,
                20.5888,
                D(2023, 7, 1),
                D(2023, 7, 2),
                memory="El acueducto iluminado de noche.",
                photos=4,
            ),
            StopSeed(
                "Guanajuato",
                -101.2574,
                21.0190,
                D(2023, 7, 3),
                D(2023, 7, 4),
                memory="Callejoneada hasta el Callejón del Beso.",
                monument="ciudad-de-guanajuato",
                photos=6,
            ),
            StopSeed(
                "Guadalajara",
                -103.3496,
                20.6597,
                D(2023, 7, 5),
                D(2023, 7, 6),
                memory="Los murales de Orozco en el Hospicio Cabañas.",
                monument="hospicio-cabanas",
                photos=4,
            ),
        ),
    ),
    # Viajes extra para cubrir los países y estados que las maquetas encienden.
    TripSeed(
        "Antigua y Costa Rica",
        Visibility.public,
        stops=(
            StopSeed(
                "Antigua Guatemala",
                -90.7295,
                14.5586,
                D(2020, 1, 3),
                D(2020, 1, 6),
                memory="El volcán de Agua asomándose al final de cada calle empedrada.",
                photos=7,
            ),
            StopSeed(
                "San José",
                -84.0907,
                9.9281,
                D(2020, 1, 7),
                D(2020, 1, 9),
                memory="Gallo pinto y lluvia de cinco minutos cada tarde.",
                photos=5,
            ),
        ),
    ),
    TripSeed(
        "Cartagena",
        Visibility.private,
        stops=(
            StopSeed(
                "Cartagena de Indias",
                -75.4794,
                10.3910,
                D(2022, 9, 10),
                D(2022, 9, 14),
                memory="Ciudad amurallada al atardecer y limonada de coco.",
                photos=6,
            ),
        ),
    ),
    TripSeed(
        "Madrid, Lisboa y París",
        Visibility.private,
        stops=(
            StopSeed(
                "Madrid",
                -3.7038,
                40.4168,
                D(2026, 5, 2),
                D(2026, 5, 5),
                memory="El Prado de mañana y vermut en La Latina.",
                photos=3,
            ),
            StopSeed(
                "Lisboa",
                -9.1393,
                38.7223,
                D(2026, 5, 6),
                D(2026, 5, 8),
                memory="El tranvía 28 y pastéis de nata todavía tibios.",
                photos=3,
            ),
            StopSeed(
                "París",
                2.3522,
                48.8566,
                D(2026, 5, 9),
                D(2026, 5, 12),
                memory="Picnic junto al Sena hasta que se encendió la torre.",
                photos=3,
            ),
        ),
    ),
)


@dataclass(frozen=True)
class LooseMemorySeed:
    """Recuerdo sin viaje: crea un viaje automático ("Veracruz · ago 2020")."""

    stop: StopSeed
    visibility: Visibility = Visibility.private


LOOSE_MEMORIES = (
    LooseMemorySeed(
        StopSeed(
            "Veracruz",
            -96.1342,
            19.1738,
            D(2020, 8, 15),
            memory="Café lechero en La Parroquia, golpeando el vaso con la cuchara.",
            photos=3,
        )
    ),
)
