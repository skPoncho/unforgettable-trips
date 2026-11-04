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
- Controles de fases posteriores (búsqueda, Compartir, Nuevo recuerdo, globo y Reproduce tu historia) se muestran como en la maqueta con `aria-disabled` y el aviso "Próximamente · fase N".
- `/viajes` (lista) y `/viajes/:id` (versión mínima) existen para que la tarjeta y la tira naveguen; la fase 5 completa el detalle.

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
- Las fotos viven en el volumen `photos-data` (`/data/photos` en `api`); las pruebas usan una carpeta temporal (fixture `storage`).
- Fixtures de pruebas de usuario en `tests/conftest.py`: `db` (vacía los datos de usuario al terminar), `make_user`, `act_as` y `user`.

## Cómo trabajar en este repo

- Avanza **por fases** según `docs/PLAN.md`. Cada fase termina con algo que se pueda probar en el navegador, pruebas en verde y un commit.
- Antes de cambios grandes, propone un plan y espera aprobación.
- Mantén los tokens de color en un solo lugar; no metas colores sueltos en los componentes.
- Las reglas de negocio (qué cuenta como visitado, visibilidad efectiva) viven en las vistas y servicios descritos en `docs/MODELO-DATOS.md`; no las repitas en el frontend.
- Cuando se tome una decisión abierta, muévela a "Decisiones ya tomadas" en este archivo.
