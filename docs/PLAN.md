# Huella · Plan de trabajo

Plan vigente (reemplaza a `docs/PLAN-PROPUESTO.md`). Decisiones y convenciones en `.claude/CLAUDE.md`; modelo de datos en `docs/MODELO-DATOS.md`.

Reglas del plan:

- Cada **fase** termina con algo visible en el navegador, pruebas en verde y un commit.
- Cada **tarea** (0.1, 0.2…) cabe en una sesión de trabajo. Si una tarea crece, se parte antes de empezar.
- Todo corre en **contenedores Docker** (`db`, `api`, `web`). Los comandos se ejecutan con `make` / `docker compose`, no con Python o Node de la Mac.
- Al iniciar una fase se propone su plan detallado y se espera aprobación antes de tocar código.

## Dependencias entre fases

```
0 → 1 → 2 → 3 ─┬→ 4 ─┐
               ├→ 5 ─┼→ 7 → 8 → 9
               └→ 6 ─┘
```

- 4, 5 y 6 dependen de 3 (mapa base y layout) y son independientes entre sí. 5 y 6 funcionan con las fotos semilla aunque 4 no esté.
- 7 necesita 3 y 6 (la búsqueda también incluye monumentos).
- 8 necesita todas las pantallas para aplicar la visibilidad en cada una.

| Fase | Depende de | Resultado visible |
| --- | --- | --- |
| 0 · Cimientos | — | Encabezado con cambio de tema; `/health` |
| 1 · Datos geográficos | 0 | Página `/dev/geo` con mundo y México |
| 2 · Modelo y API | 1 | Progreso 12/195 desde la API |
| 3 · Mi mapa | 2 | Pantalla 1 con datos reales |
| 4 · Nuevo recuerdo | 3 | Subir fotos y encender un país |
| 5 · Detalle de viaje | 3 | Pantalla 2 con ruta y bitácora |
| 6 · Mi país | 3 | Pantalla 3 con estados y pasaporte |
| 7 · Historia, globo y búsqueda | 3, 6 | Animación por año, globo y búsqueda |
| 8 · Multiusuario y compartir | 4, 5, 6, 7 | Cuentas, perfil público y enlaces |
| 9 · Despliegue y pulido | 8 | App en línea con HTTPS y respaldos |

---

## Fase 0 · Cimientos

- **0.1 Estructura y Compose.** Carpetas `api/` y `web/`; `docker-compose.yml` con tres servicios: `db` (imagen `postgis/postgis` con versión fijada y volumen de datos), `api` y `web`, con healthchecks y `depends_on`. `.env.example`, `Makefile` como atajo de `docker compose` (`dev`, `stop`, `test`, `lint`, `migrate`, `seed`, `shell-api`, `shell-web`), `.editorconfig`, `.gitignore`, `.dockerignore` y `.claude/launch.json` apuntando a `localhost:4200`.
- **0.2 api.** `api/Dockerfile` (Python + `uv`; etapa `dev` con `uvicorn --reload` y código montado como volumen). FastAPI con `pydantic-settings`; Alembic con una migración inicial que activa PostGIS y que se corre al arrancar el contenedor; `GET /health` que consulta la BD y la versión de PostGIS; ruff (lint + formato); pytest con una prueba de `/health`. Todo se ejecuta dentro del contenedor.
- **0.3 web.** `web/Dockerfile` (Node; etapa `dev` con `ng serve --host 0.0.0.0` y vigilancia de archivos por sondeo si hace falta en macOS; `node_modules` en un volumen). Proyecto generado con `ng new` dentro del contenedor: standalone, zoneless, SCSS, sin SSR. ESLint + Prettier, Vitest con una prueba y proxy `/api` → `http://api:8000` por la red de Compose.
- **0.4 Tokens y tema.** `web/src/styles/tokens.css` como fuente única (copiada de `design/tokens.css` más los extras de las maquetas: `panel-2`, `overlay`, `scrim`, `shadow`, `track`, `dot-off`, `placeholder`). Fuentes de Google Fonts. `ThemeService`: preferencia `system | dark | light` guardada en localStorage, resuelta con `matchMedia` y aplicada siempre como `data-theme` en `<html>`; script en `index.html` para evitar el parpadeo.
- **0.5 Encabezado.** Logo, vistas (Mundo / Mi país / Ciudades / Monumentos) con rutas vacías, botón sol/luna y avatar. Iconos de Lucide.
- **0.6 CI.** GitHub Actions que construye las imágenes y corre lint y pruebas dentro de los contenedores en cada push (mismo comando que en local).

**Hecho cuando:**
- Con solo Docker instalado, `make dev` levanta los tres contenedores.
- Editar un archivo de `api` o `web` recarga sin reiniciar contenedores.
- `localhost:4200` muestra el encabezado; el tema sigue al sistema, cambia con el botón y se mantiene al recargar.
- `localhost:8000/health` responde `{"status":"ok","db":"ok","postgis":"3.x"}`.
- `make lint` y `make test` pasan en local y en CI.

## Fase 1 · Datos geográficos

- **1.1 Catálogo de países.** `api/data/countries.csv` con ISO2/ISO3/numérico, nombre en español, continente, `counts_in_progress` y soberano (para territorios). Prueba: 195 países que cuentan y 35/44/48/54/14 por continente.
- **1.2 Geometrías para el mapa.** Script `geo/build.mjs` (evoluciona `scripts/generar-mapas.mjs`; se corre en un contenedor con `make build-geo`): `world-atlas` 50m → `world.topo.json` con ids ISO3; Natural Earth admin-1 filtrado a México → `mexico.topo.json` con 32 estados; simplificado con mapshaper; salida a `web/public/geo/`. Reporta los países sin geometría visible, que se dibujarán como punto.
- **1.3 Geometrías en PostGIS.** Migraciones de `countries`, `subdivisions` y `cities`; comando idempotente `make load-geo` con geometrías Natural Earth 10m (más precisas para punto → país).
- **1.4 Ciudades.** GeoNames `cities5000` con nombres en español (alternate names `es`) y enlace a los estados de México por admin1. La descarga se cachea fuera del repo.
- **1.5 Endpoints geográficos.** `GET /api/geo/countries`, `/api/geo/subdivisions?country=MEX`, `/api/geo/cities?q=` y `/api/geo/reverse?lat&lon` (país, estado y ciudad más cercana, con tolerancia de 20 km para puntos en la costa).
- **1.6 Página de verificación.** Ruta `/dev/geo` con D3: mundo en Equal Earth y México por estados; al pasar el mouse muestra el nombre en español.

**Hecho cuando:**
- `/api/geo/countries` devuelve los 195 que cuentan, con nombres en español.
- `/api/geo/subdivisions?country=MEX` devuelve 32 estados.
- Pruebas de `reverse` pasan para Kioto (Japón · Kioto), el Zócalo (México · Ciudad de México) y Tocumen (Panamá).
- `/dev/geo` muestra ambos mapas.
- Queda confirmada la convención de territorios (qué entidades no suman a los 195).

## Fase 2 · Modelo y API

- **2.1 Migraciones.** `users`, `trips`, `stops`, `memories`, `photos`, `monuments`, `wishlist_items` y las vistas derivadas de `docs/MODELO-DATOS.md`.
- **2.2 Usuario actual.** Dependencia `current_user` que devuelve el usuario semilla hasta la fase 8; filtro por `user_id` en todos los repositorios.
- **2.3 Viajes y paradas.** CRUD con orden, tipo de visita y país/estado calculados desde el punto.
- **2.4 Recuerdos.** CRUD con la regla de visibilidad (igual o más privada que el viaje) y el viaje automático para recuerdos sueltos.
- **2.5 Almacenamiento.** Interfaz `StorageBackend` con implementación en disco (guardar, abrir, borrar, url) sobre un volumen de Docker montado en `api`. Sin subida todavía.
- **2.6 Progreso.** `GET /api/me/progress` (países, continentes, estados, ciudades, monumentos, viajes, fotos) y `GET /api/me/map` (estado por país y por estado, año de primera visita).
- **2.7 Semillas.** `make seed`: usuario Carlos con casa en Ciudad de México, viajes de las maquetas (Japón completo con escala en Panamá), monumentos de las maquetas y fotos de relleno generadas con EXIF. Las maquetas no cuadran entre sí en algunos totales (9 viajes contra 11 países; 18 contra 12 monumentos); se reproduce exactamente lo verificable de abajo y el resto sale de lo cargado.

**Hecho cuando:**
- Tras `make seed`, `/api/me/progress` da 12/195 (uno por escala), América 7, Europa 4, Asia 1, África 0, Oceanía 0, y 12/32 estados.
- Hay pruebas que pasan para: la escala suma; la casa suma; un país con solo escalas se marca `stopover`; un recuerdo no puede ser más abierto que su viaje; un recuerdo sin viaje crea un viaje automático; un segundo usuario no ve nada del primero.

## Fase 3 · Mi mapa (pantalla 1, `Main.dc.html`)

- **3.1 Layout y cliente.** Estructura de la pantalla y cliente de API con tipos generados desde el OpenAPI (`openapi-typescript`).
- **3.2 Mapa mundial.** Componente D3: estados visitado / escala / deseo / por descubrir con tokens, halo en oscuro y borde en claro, puntos de luz de ciudades, países chicos como punto.
- **3.3 Interacción.** Zoom y arrastre (d3-zoom), botones +/−, capas activables (países, ciudades, monumentos, deseos) y leyenda.
- **3.4 Panel de progreso.** Cifra grande, 195 puntos (escala como punto hueco), próximo hito, barras por continente, estadísticas y lista de deseos.
- **3.5 Tarjeta de país.** Al pasar o hacer clic: fotos, fechas, conteos y "Abrir viaje" (lista si hay varios); etiqueta "Escala" cuando aplica.
- **3.6 Tira de viajes.** Código de país, visibilidad, portada, nombre, fechas y estadísticas.

**Hecho cuando:**
- Con las semillas, `localhost:4200` se ve como `Main.dc.html` en ambos temas (comparación lado a lado con captura).
- Todos los conteos vienen de la API.
- La tarjeta de Japón navega al detalle de su viaje.

## Fase 4 · Nuevo recuerdo (pantalla 4, `Recuerdo.dc.html`)

- **4.1 Subida de fotos.** `POST /api/photos` múltiple: validación de tipo y tamaño, HEIC → JPEG, dedupe por sha256, lectura de EXIF (fecha y GPS), variantes `display` y `thumb` sin metadatos.
- **4.2 Sugerencias.** `POST /api/memories/suggest`: lugar (GPS de las fotos → `reverse`), fecha, monumentos a menos de 5 km y viaje existente cuyas fechas coinciden.
- **4.3 Ventana y fotos.** Modal sobre el mapa atenuado, zona de arrastre, cuadrícula con indicador de ubicación, reordenar (CDK drag-drop); la primera foto es la portada.
- **4.4 Detalles.** Lugar detectado con minimapa, "Cambiar lugar" con autocompletado, tipo de visita, vínculo a viaje y monumento, anécdota y visibilidad (solo las opciones permitidas por el viaje).
- **4.5 Guardado.** Transacción que reusa la parada si coinciden ciudad y fechas, crea el viaje automático si no se eligió viaje y dispara la animación de "encender" en el mapa.
- **4.6 Servir fotos.** Endpoint por variante con verificación de dueño.

**Hecho cuando:**
- Al arrastrar la foto de prueba `kioto_gps.jpg` (EXIF 35.01 N, 135.77 E, 13 mar 2025) se sugieren "Kioto, Japón", Fushimi Inari-taisha (a ~4.8 km, por eso el radio es de 5 km) y la fecha.
- Al guardar una foto tomada en Reikiavik, Islandia se enciende en Mi mapa.
- Una prueba confirma que la variante `display` no tiene GPS.

## Fase 5 · Detalle de viaje (pantalla 2, `Viaje.dc.html`)

- **5.1 Endpoint.** `GET /api/trips/{id}` con paradas, recuerdos, fotos, monumentos y estadísticas (días, ciudades, fotos, km de ruta con PostGIS).
- **5.2 Mapa regional.** D3 (Mercator) ajustado a las estancias; las escalas lejanas van en el aviso y no estiran el mapa. Ruta curva punteada en ámbar y pines numerados.
- **5.3 Bitácora.** Lista por parada con sincronía mapa ↔ lista, entrada expandida con fotos y visor de galería.
- **5.4 Edición.** Selector de visibilidad, momento favorito, aviso de escalas, migas de pan, editar título y resumen, reordenar y borrar paradas o recuerdos.

**Hecho cuando:**
- El viaje a Japón semilla se ve como `Viaje.dc.html` en ambos temas.
- Elegir el pin 3 resalta Kioto en la lista, y elegir Kioto en la lista resalta el pin 3.
- El cambio de visibilidad persiste al recargar.

## Fase 6 · Mi país (pantalla 3, `Mexico.dc.html`)

- **6.1 Catálogo de monumentos.** Sitios UNESCO (revisar la licencia de los datos) más una lista curada de zonas arqueológicas de México en `api/data/`.
- **6.2 Mapa de México.** Estados con pines de monumentos y tarjeta del monumento elegido.
- **6.3 Pestañas.** Estados (visitados / por descubrir), Ciudades (número de viajes y "Casa") y Monumentos.
- **6.4 Pasaporte.** Sellos de los visitados y sellos punteados de los sugeridos (monumentos sin visitar más cercanos a tus paradas).
- **6.5 Perfil.** Menú de perfil con elección de ciudad de casa.

**Hecho cuando:**
- `/mi-pais` se ve como `Mexico.dc.html` en ambos temas.
- Con semillas muestra 12 de 32 (37%), Ciudad de México como "Casa" y los sellos y sugeridos del pasaporte.
- Cambiar la ciudad de casa actualiza el progreso.

## Fase 7 · Reproduce tu historia, globo y búsqueda

- **7.1 Línea de tiempo.** Endpoint con la primera visita por país y estado, agrupada por año.
- **7.2 Reproducción.** Selector de años y animación: el mapa y el contador se encienden año por año.
- **7.3 Globo 3D.** Proyección ortográfica girable con transición desde Equal Earth.
- **7.4 Búsqueda.** `unaccent` + `pg_trgm` sobre lugares, viajes y recuerdos; resultados en el encabezado navegables con teclado.

**Hecho cuando:**
- Reproducir de 2019 a 2026 enciende los países en el orden de su primera visita.
- El botón de globo muestra el mapa como globo girable y vuelve a la vista plana.
- Buscar "kioto" devuelve la ciudad, el viaje a Japón y el recuerdo de Fushimi Inari.

## Fase 8 · Multiusuario y compartir

- **8.1 Cuentas.** Registro, inicio y cierre de sesión (argon2, cookie httpOnly, CSRF, límite de intentos); reemplaza al usuario semilla.
- **8.2 Visibilidad.** Aplicada en todos los endpoints de lectura, con una matriz de pruebas (dueño / con enlace / público / otro usuario × privado / enlace / público).
- **8.3 Compartir.** Perfil público `/u/{handle}`, viaje por enlace `/t/{token}`, botón "Compartir mi mapa" y regenerar enlace.
- **8.4 Fotos a terceros.** Solo variantes sin EXIF.
- **8.5 S3.** `StorageBackend` compatible con S3 (R2/MinIO) y script de migración desde disco.
- **8.6 Preferencias.** Tema guardado en el perfil.

**Hecho cuando:**
- Un usuario B recibe 404 en el viaje privado de A.
- Un viaje "con enlace" se abre en una ventana de incógnito solo con el enlace.
- El perfil público muestra solo los viajes públicos.
- Una foto pública descargada no tiene GPS.

## Fase 9 · Despliegue y pulido

- **9.1 Producción.** Etapas `prod` de los mismos Dockerfiles (api sin recarga; web compilada y servida por Caddy, que también hace de proxy a la api con HTTPS) y `docker-compose.prod.yml`, con volúmenes para BD y fotos.
- **9.2 Servidor.** VPS, dominio, variables y secretos documentados.
- **9.3 Respaldos.** `pg_dump` diario y fotos con restic; prueba de restauración.
- **9.4 Rendimiento.** Tamaño de TopoJSON, carga diferida y caché de imágenes.
- **9.5 Accesibilidad y créditos.** Teclado, contraste y lectores de pantalla; página de créditos (GeoNames CC BY, Natural Earth, UNESCO).
- **9.6 Despliegue automático** desde GitHub Actions.

**Hecho cuando:**
- La app corre en su dominio con HTTPS.
- Se restauró un respaldo en un entorno limpio.
- Lighthouse da 95 o más en accesibilidad.
