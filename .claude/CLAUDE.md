# Huella — atlas personal de viajes (unforgettable-trips)

App web para registrar viajes **centrada en mapas**: cada país, estado de México, ciudad o monumento que visitas se "enciende" en el mapa, y cada lugar guarda fotos y anécdotas escritas por el usuario. Proyecto personal de Carlos; primero lo usa él solo y después se abrirá a más usuarios que podrán ver y compartir sus propios viajes.

## Lee antes de proponer o escribir código

- `docs/PLAN.md`: **plan vigente** por fases, con tareas y criterios de "hecho".
- `docs/PRODUCTO.md`: qué hace la app, reglas de negocio y alcance.
- `docs/MODELO-DATOS.md`: tablas, relaciones y vistas derivadas.
- `docs/DISENO.md`: sistema visual (temas oscuro y claro), pantallas y comportamiento.
- `design/pantallas/*.dc.html`: maquetas de referencia exportadas de un lienzo de diseño. **No son código de producción** y no corren solas (dependen de un runtime del lienzo). Úsalas para leer estructura, textos, colores y estados. La sintaxis `{{hole}}`, `<sc-for>` y `<sc-if>` es del lienzo, no de ningún framework.
- `design/mapas/*.svg`: mapas pre-renderizados de ejemplo. `scripts/generar-mapas.mjs` muestra cómo se generaron (d3-geo + TopoJSON).
- `docs/PLAN-PROPUESTO.md`: borrador original, ya reemplazado por `docs/PLAN.md`.

## Decisiones ya tomadas

### Producto
- Uso principal en **PC** (escritorio). En pantallas chicas debe verse correcto, pero el diseño se optimiza para escritorio.
- **Multiusuario desde el modelo de datos**: todo pertenece a un `user_id` desde el día 1, aunque al inicio haya un solo usuario.
- Visibilidad por viaje: `private` | `link` | `public` (Privado / Con enlace / Público).
- **Visibilidad del recuerdo**: hereda la del viaje y puede ser **más privada, nunca más abierta**. La visibilidad efectiva es la más restrictiva de las dos.
- **Escalas cuentan como visita** (tipo de visita `stay` | `stopover`). Una escala enciende el país o estado, pero se distingue visualmente.
- **Recuerdo sin viaje**: se crea un viaje automático de una parada (ej. "Kioto · mar 2025"), renombrable y fusionable con otro viaje.
- **Ciudad de casa**: el usuario elige su residencia; esa ciudad, su estado y su país cuentan como visitados y llevan la etiqueta "Casa".
- Subdivisiones: **solo estados de México** por ahora. Para otros países solo cuenta el nivel país (y las ciudades).
- Fotos en **almacenamiento propio** al inicio (volumen de Docker), detrás de la interfaz `StorageBackend` que después pueda apuntar a S3 o similar sin tocar el resto del código.
- Dos temas, **oscuro** (por defecto) y **claro**. El tema inicial sigue la preferencia del sistema operativo y el usuario lo puede fijar.

### Técnicas
- **Todo corre en contenedores Docker**, en desarrollo y en producción: `db` (PostgreSQL + PostGIS), `api` y `web`. En desarrollo el código se monta como volumen con recarga en caliente. Los comandos se ejecutan con `make` / `docker compose`, **nunca** con Python, `uv`, Node o Postgres instalados en la Mac.
- **Frontend**: Angular 22, componentes standalone, signals, sin zone.js, SCSS, Vitest, ESLint + Prettier. Iconos de Lucide con **`@lucide/angular`** (componentes por icono, p. ej. `<svg lucideSun [size]="19">`). El paquete viejo `lucide-angular` se abandonó en 1.0.0 y no soporta Angular 22.
- **Imagen de PostGIS**: `imresamu/postgis` (multiarquitectura, del mismo mantenedor de `postgis/postgis`, que solo publica amd64). Versión fijada en `docker-compose.yml`.
- **Mapas**: solo **D3 + TopoJSON** en SVG. Zoom con d3-zoom; el globo 3D es una proyección ortográfica girable. MapLibre solo si después se pide zoom a nivel calle en el detalle de viaje.
- **Backend**: FastAPI + SQLAlchemy 2 + GeoAlchemy2 + Alembic, Pydantic v2, `uv`, ruff, pytest. PostgreSQL + PostGIS.
- Tipos de TypeScript generados desde el OpenAPI de FastAPI (`openapi-typescript`).
- **Idioma**: nombres en código en **inglés** (tablas, clases, endpoints, enums; ver glosario). Comentarios, commits y documentación en **español**. Textos de la interfaz en español de México.
- **Tokens**: la fuente única es `web/src/styles/tokens.css` (a partir de la fase 0). `design/tokens.css` queda solo como referencia.

### Datos geográficos
- Países: `world-atlas` 50m para el mapa; Natural Earth 10m (v5.1.2) en PostGIS para punto → país. Progreso sobre 195 países (193 de la ONU, Vaticano y Palestina) con 35/44/48/54/14 por continente: Rusia en Europa; Turquía, Chipre, el Cáucaso y Kazajistán en Asia; Egipto en África. Catálogo en `api/data/countries.csv`.
- **Territorios** (decidido en la fase 1): Groenlandia, Puerto Rico, Taiwán, Kosovo, Sáhara Occidental, Hong Kong, Macao y demás se pintan en el mapa con su nombre pero **no suman al progreso, ni siquiera a su soberano**. Lo que Natural Earth ya incluye dentro de un país (Guayana Francesa, Canarias, Åland…) cuenta como ese país; Somalilandia y Chipre del Norte se funden con Somalia y Chipre. El mapeo vive en `api/data/natural_earth.json`.
- Estados de México: **Natural Earth admin-1** (dominio público) para mapa y PostGIS. `@svg-maps/mexico` solo se usó para las maquetas (son trazos ya proyectados, no coordenadas).
- Ciudades: GeoNames **`cities5000`** con nombres en español (CC BY 4.0: requiere atribución visible). Se descartan los barrios (`PPLX`, p. ej. Castro Pretorio en Roma) para que un punto en el centro dé la ciudad y no el barrio (fase 2).
- Sellos de monumentos: se derivan de los recuerdos ligados a un monumento; no hay tabla propia.

### API del usuario (fase 2)
- Hasta la fase 8 todas las peticiones actúan como el usuario semilla (`current_user`, handle `carlos`, configurable con `CURRENT_USER_HANDLE`). Sin `make seed`, `/api/me/*` responde 503.
- Lo que no existe **o es de otro usuario** responde **404** (nunca 403), para no revelar que existe.
- País y estado de una parada se calculan desde el punto (`app/geo/locate.py`, lo mismo que `/api/geo/reverse`). Si no se manda `city_id`, una **estancia** toma la ciudad más cercana y una **escala** queda sin ciudad (aeropuertos).
- Las reglas de "visitado" viven en las vistas `user_country_status` / `user_subdivision_status` y la visibilidad efectiva en la función SQL `effective_visibility()` (migración 0004). La casa tiene `first_visited_on` nulo: cuenta desde siempre.
- Los archivos de fotos se borran después del commit (`app/services/photos.py`); claves `users/{user_id}/photos/{photo_id}/{original|display|thumb}.jpg`.

### Mi mapa (fase 3)
- Ciudades visitadas en la vista `user_city_status` (migración 0005), con la misma regla que países y estados; `/api/me/progress` cuenta ciudades desde ahí.
- `/api/me/map` trae también `cities` (puntos de luz) y `monuments` (sellados). La tarjeta de país sale de `GET /api/me/countries/{iso3}` (404 si no lo visitaste); los días son días distintos con estancia.
- Fotos: `GET /api/photos/{id}/{display|thumb}` con verificación de dueño (se adelantó la lectura de la 4.6). El original con EXIF nunca se sirve.
- Tipos del web generados con `make gen-api` en `web/src/app/core/api/` (`openapi.json` y `schema.d.ts`, en git; alias en `types.ts`). CI falla si no están al día. `openapi-typescript` aún no acepta TypeScript 6: corre con `npx` y versión fijada, fuera de `package.json`.
- Zoom del mapa: botones, arrastre y Ctrl/⌘ + rueda (la rueda sola desplaza la página).
- Controles de fases posteriores (búsqueda, Compartir, globo y Reproduce tu historia) se muestran como en la maqueta con `aria-disabled` y el aviso "Próximamente · fase N". "Nuevo recuerdo" funciona desde la fase 4.
- `/viajes` (lista) y `/viajes/:id` existen para que la tarjeta y la tira naveguen; el detalle completo es de la fase 5.

### Nuevo recuerdo (fase 4)
- Subida: `POST /api/photos` (multipart `files`), JPG/PNG/HEIC (`pillow-heif`) decididos por contenido; 30 MB por foto y 50 por petición (`max_photo_bytes`, `max_photos_per_upload`). Cada archivo se valida aparte: los rechazados van en `errors`. Duplicados por sha256 del archivo subido (`duplicate: true`, `INSERT … ON CONFLICT`). Procesamiento en `app/services/images.py`; la semilla usa las mismas variantes.
- Fecha local de la foto en `photos.taken_on` (migración 0006): `taken_at` en UTC cambia de día (8:10 en Kioto es el día anterior en UTC).
- Los archivos escritos en una transacción que hace rollback se borran solos (`_save_files` en `app/services/photos.py`). Fotos sin recuerdo de más de 24 h: se borran en cada subida. `DELETE /api/photos/{id}` quita una foto.
- Sugerencias: `POST /api/memories/suggest` (no guarda). Lugar = mediana del GPS de las fotos → `locate()`; monumentos a **menos de 5 km** (Fushimi Inari queda a ~4.8 km del centro de Kioto); viajes cuyas fechas se cruzan, primero los que tienen parada en la misma ciudad. Con `location` o fechas (al "Cambiar lugar") se ignoran las de las fotos.
- Guardado: `POST /api/memories` acepta `photo_ids` (en orden; la primera es la portada) y `trip_id` + `place`: reusa la parada del viaje con la misma ciudad y fechas que se cruzan (`trips.matching_stop`) o agrega una en orden cronológico. Responde `lit` (países, estados y ciudades que se encendieron o pasaron de escala a visitado, comparando las vistas de estado antes y después).
- Web: la ventana es la ruta hija `/nuevo-recuerdo` de Mi mapa (el mapa no se desmonta). Al guardar, `MemoryEvents` avisa a Mi mapa, que recarga y anima `lit` (`country--lit`, aviso "… se encendió en tu mapa"). La ventana no se cierra al hacer clic fuera, para no perder fotos.
- Fotos de prueba con EXIF real en `api/tests/fixtures/` (`kioto_gps.jpg`, `reikiavik_gps.jpg`, `sin_gps.jpg`), generadas con `docker compose run --rm --no-deps api python -m app.seed.fixtures`; una prueba revisa que estén al día. Sirven para arrastrarlas a la ventana.

### Detalle de viaje (fase 5)
- `GET /api/trips/{id}` (y las respuestas de `POST`/`PATCH` del viaje) traen cada parada con sus `memories` y sus fotos en orden, más `route_km`, `trip_number`/`trip_total` y `continent` (`app/services/trip_detail.py`). Los viajes automáticos también cuentan en "viaje N de M".
- `route_km`: línea geodésica (PostGIS) entre las **estancias** en orden; las escalas no cuentan (Japón da ~725 km; la maqueta decía 850, inventado).
- **Escalas**: no llevan número ni entran en la bitácora; van en el aviso ("Ida con escala en…") y solo se dibujan en el mapa si caen dentro del encuadre. Los pines numeran solo estancias (Kioto es el 3). En "Editar paradas" sí aparecen, para moverlas o borrarlas.
- Mapa regional: `core/map/trip-route.ts` (Mercator ajustado a las estancias, encuadre mínimo de 1.2°, curvas de `scripts/generar-mapas.mjs`, acomodo de etiquetas por choque). Se dibuja a 540×570, cerca del tamaño real, porque pines y etiquetas miden lo mismo en píxeles a cualquier escala. Con el mapa a menos de 460 px solo se ve la etiqueta de la parada elegida.
- Se mantiene el encabezado global; la pantalla agrega su barra (Mi mapa, migas, visibilidad, "Agregar recuerdo"). La parada elegida va en `?parada=N`. "Agregar recuerdo" abre `/nuevo-recuerdo?viaje=<id>` con el viaje elegido y, al cerrar o guardar, vuelve al viaje.
- El momento favorito de la semilla de Japón es el de Hakone (la cita del Fuji de la maqueta).

## Decisiones abiertas (pregúntale a Carlos antes de fijarlas)

- **Autenticación** (fase 8). Dirección tentativa: correo + contraseña (argon2) con sesión en cookie httpOnly; Google opcional después.
- **Despliegue** (fase 9). Dirección tentativa: VPS con Docker Compose + Caddy (HTTPS), por las fotos en volumen persistente.
- **Catálogo de monumentos** (fase 6): sitios UNESCO más zonas arqueológicas de México; revisar licencias de los datos.

## Glosario (español → código)

| Interfaz | Código |
| --- | --- |
| viaje | `trip` |
| parada | `stop` |
| recuerdo | `memory` |
| foto | `photo` |
| estancia / escala | `stay` / `stopover` |
| privado / con enlace / público | `private` / `link` / `public` |
| lista de deseos | `wishlist` |
| monumento / sello | `monument` / `stamp` |
| estado (de México) | `subdivision` |
| casa | `home` |
| progreso | `progress` |

## Comandos

Solo se necesita Docker Desktop encendido. `make help` lista todo.

- `make dev`: construye y levanta `db`, `api` y `web` (`localhost:4200`, `localhost:8000`; crea `.env` desde `.env.example` si falta). La api migra al arrancar.
- `make stop` / `make down` / `make logs`.
- `make test` / `make lint`: pruebas y lint de api y web dentro de los contenedores (lo mismo corre en CI). `make format` aplica ruff y Prettier.
- `make migrate`: migraciones de Alembic.
- `make seed`: recrea al usuario semilla (Carlos, casa en Ciudad de México) con los viajes, monumentos y 412 fotos de relleno de las maquetas (`app/seed/data.py`). Idempotente; necesita `make load-geo` antes y tarda ~20 s.
- `make load-geo`: carga países, estados de México y ciudades (GeoNames `cities5000`) en PostGIS. Idempotente; la primera vez descarga ~250 MB y tarda ~1 min.
- `make build-geo`: regenera `web/public/geo/world.topo.json` y `mexico.topo.json` (contenedor `geo`, perfil `tools`). Los TopoJSON se guardan en git.
- `make gen-api`: regenera los tipos de TypeScript desde el OpenAPI de la api. Córrelo después de cambiar un esquema o endpoint.
- `make shell-api` / `make shell-web`: terminal dentro del contenedor.

Notas:
- Las pruebas de api usan la BD `huella_test`, que `tests/conftest.py` crea y migra sola.
- `node_modules` vive en un volumen de Docker; `web/docker-entrypoint.sh` reinstala si cambió `package-lock.json`. Para agregar paquetes: `make shell-web` y `npm install …`.
- Las dependencias de Python viven en `/opt/venv` dentro de la imagen; tras cambiar `pyproject.toml`, corre `uv lock` en `make shell-api` y vuelve a `make dev` (reconstruye).
- `src/testing/` del web tiene utilidades solo para pruebas (p. ej. `mockSystemTheme`, porque jsdom no trae `matchMedia`, y `fixtures.ts` con datos tipados como la API).
- En pruebas con `httpResource`, `fixture.whenStable()` espera a que respondan las peticiones: primero `TestBed.tick()` y `flush`, después `whenStable()`.
- Las descargas geográficas viven en `~/.cache/huella/geo` (fuera del repo; se monta en `/cache` de `api` y `geo`; se cambia con `HOST_GEO_CACHE`). Las pruebas de geo cargan los datos reales en `huella_test` la primera vez (fixture `geo_data`).
- `localhost:4200/dev/geo` es la página de verificación de los datos geográficos y del progreso del usuario semilla (no aparece en el encabezado). La API documentada está en `localhost:8000/docs`.
- Las fotos viven en el volumen `photos-data` (`/data/photos` en `api`); las pruebas usan una carpeta temporal (fixture `storage`). `tests/helpers.py` tiene `upload()` / `upload_ids()` para subir fotos de `tests/fixtures`.
- Fixtures de pruebas de usuario en `tests/conftest.py`: `db` (vacía los datos de usuario al terminar), `make_user`, `act_as` y `user`.

## Cómo trabajar en este repo

- Avanza **por fases** según `docs/PLAN.md`. Cada fase termina con algo que se pueda probar en el navegador, pruebas en verde y un commit.
- Antes de cambios grandes, propone un plan y espera aprobación.
- Mantén los tokens de color en un solo lugar; no metas colores sueltos en los componentes.
- Las reglas de negocio (qué cuenta como visitado, visibilidad efectiva) viven en las vistas y servicios descritos en `docs/MODELO-DATOS.md`; no las repitas en el frontend.
- Cuando se tome una decisión abierta, muévela a "Decisiones ya tomadas" en este archivo.
