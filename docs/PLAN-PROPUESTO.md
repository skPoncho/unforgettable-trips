# Huella · Plan propuesto (borrador)

Este es un punto de partida para que Claude Code lo afine con Carlos y lo convierta en `docs/PLAN.md`, con tareas pequeñas y criterios de aceptación. Cada fase debe terminar con algo visible en el navegador y un commit.

## Fase 0 · Cimientos
- Cerrar las decisiones abiertas de `.claude/CLAUDE.md` (frontend, librería de mapas, backend y base de datos).
- Estructura del repo (por ejemplo `api/` y `web/`), entorno local con Docker Compose (PostgreSQL + PostGIS) y scripts de arranque.
- Lint, formato y un primer test por proyecto.
- Tokens de `design/tokens.css`, fuentes y selector de tema funcionando (sistema → elección del usuario, persistida).
- **Hecho cuando:** `web` muestra una página vacía con encabezado y cambio de tema, y `api` responde a `/health`.

## Fase 1 · Datos geográficos
- Cargar países (código ISO, nombre en español, continente, geometría simplificada) y estados de México.
- Servir geometrías como TopoJSON estático o desde la API.
- Adaptar `scripts/generar-mapas.mjs` si se decide pre-generar algo.
- **Hecho cuando:** existe un endpoint o archivo con los 195 países y los 32 estados, con nombres en español.

## Fase 2 · Modelo y API
- Tablas: usuarios, viajes, paradas (con tipo `estancia`/`escala`), recuerdos, fotos, monumentos, sellos, lista de deseos. Todo con `user_id`.
- CRUD de viajes, paradas y recuerdos, y un endpoint de progreso (países, continentes, estados, monumentos).
- Datos semilla con los viajes de ejemplo de las maquetas.
- **Hecho cuando:** el endpoint de progreso devuelve 12/195 con los datos semilla, contando la escala.

## Fase 3 · Mi mapa (pantalla 1)
- Mapa mundial con países por estado (visitado, escala, deseo, por descubrir), panel de progreso, leyenda, capas y tarjeta flotante al seleccionar un país.
- Tira de viajes.
- **Hecho cuando:** la pantalla se ve como la maqueta en ambos temas, con datos de la API.

## Fase 4 · Nuevo recuerdo (pantalla 4)
- Subida múltiple de fotos a almacenamiento propio detrás de una interfaz (`StorageBackend`), con miniaturas.
- Lectura de EXIF (fecha y GPS) y geocodificación inversa de punto a país, estado y ciudad.
- Tipo de visita, vínculo a viaje y monumento, anécdota y visibilidad.
- **Hecho cuando:** al subir fotos con GPS se sugiere el lugar correcto y, al guardar, el país se enciende en el mapa.

## Fase 5 · Detalle de viaje (pantalla 2)
- Mapa de la región con ruta y paradas numeradas, bitácora sincronizada, galería de fotos y control de visibilidad.

## Fase 6 · Mi país (pantalla 3)
- México por estados, pestañas Estados / Ciudades / Monumentos, catálogo de monumentos y pasaporte de sellos.

## Fase 7 · Reproduce tu historia y búsqueda
- Animación del mapa por año y búsqueda de lugares, viajes y recuerdos.

## Fase 8 · Multiusuario y compartir
- Registro e inicio de sesión, aplicación real de la visibilidad, perfil público y enlaces para compartir.
- Fotos públicas servidas sin metadatos de ubicación.
- Opción de mover el almacenamiento a S3 o similar.

## Fase 9 · Despliegue y pulido
- Despliegue, respaldos, rendimiento de mapas y accesibilidad.
