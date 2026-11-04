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
- **Frontend**: Angular 22, componentes standalone, signals, sin zone.js, SCSS, Vitest, ESLint + Prettier. Iconos de Lucide (`lucide-angular`).
- **Mapas**: solo **D3 + TopoJSON** en SVG. Zoom con d3-zoom; el globo 3D es una proyección ortográfica girable. MapLibre solo si después se pide zoom a nivel calle en el detalle de viaje.
- **Backend**: FastAPI + SQLAlchemy 2 + GeoAlchemy2 + Alembic, Pydantic v2, `uv`, ruff, pytest. PostgreSQL + PostGIS.
- Tipos de TypeScript generados desde el OpenAPI de FastAPI (`openapi-typescript`).
- **Idioma**: nombres en código en **inglés** (tablas, clases, endpoints, enums; ver glosario). Comentarios, commits y documentación en **español**. Textos de la interfaz en español de México.
- **Tokens**: la fuente única es `web/src/styles/tokens.css` (a partir de la fase 0). `design/tokens.css` queda solo como referencia.

### Datos geográficos
- Países: `world-atlas` 50m para el mapa; Natural Earth 10m en PostGIS para punto → país. Progreso sobre 195 países con la convención de continentes 35/44/48/54/14.
- Estados de México: **Natural Earth admin-1** (dominio público) para mapa y PostGIS. `@svg-maps/mexico` solo se usó para las maquetas (son trazos ya proyectados, no coordenadas).
- Ciudades: GeoNames **`cities5000`** con nombres en español (CC BY 4.0: requiere atribución visible).
- Sellos de monumentos: se derivan de los recuerdos ligados a un monumento; no hay tabla propia.

## Decisiones abiertas (pregúntale a Carlos antes de fijarlas)

- **Autenticación** (fase 8). Dirección tentativa: correo + contraseña (argon2) con sesión en cookie httpOnly; Google opcional después.
- **Despliegue** (fase 9). Dirección tentativa: VPS con Docker Compose + Caddy (HTTPS), por las fotos en volumen persistente.
- **Territorios** fuera de los 195 (Groenlandia, Puerto Rico, Kosovo, Taiwán…): propuesta de pintarlos como tierra sin sumar al progreso; confirmar en la fase 1.
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

Se completan en la fase 0. Previstos:

- `make dev`: levanta `db`, `api` y `web` (`localhost:4200` y `localhost:8000`).
- `make test` / `make lint`: pruebas y lint de api y web dentro de los contenedores.
- `make migrate`, `make seed`, `make load-geo`, `make build-geo`.
- `make shell-api` / `make shell-web`: terminal dentro del contenedor.

## Cómo trabajar en este repo

- Avanza **por fases** según `docs/PLAN.md`. Cada fase termina con algo que se pueda probar en el navegador, pruebas en verde y un commit.
- Antes de cambios grandes, propone un plan y espera aprobación.
- Mantén los tokens de color en un solo lugar; no metas colores sueltos en los componentes.
- Las reglas de negocio (qué cuenta como visitado, visibilidad efectiva) viven en las vistas y servicios descritos en `docs/MODELO-DATOS.md`; no las repitas en el frontend.
- Cuando se tome una decisión abierta, muévela a "Decisiones ya tomadas" en este archivo.
