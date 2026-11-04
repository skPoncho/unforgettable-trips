# Huella · Diseño

Concepto: **un atlas que se enciende.** En tema oscuro los países visitados brillan como luces de ciudad sobre tinta azul ("atlas nocturno"). En tema claro el mapa es tierra blanca sobre océano gris azulado y el ámbar funciona como tinta ("atlas de día").

Las maquetas de referencia están en `design/pantallas/` (`Sistema.dc.html` resume este documento visualmente). Los tokens también están listos para usar en `design/tokens.css` (variables CSS con ambos temas). A partir de la fase 0 la **fuente única** de tokens es `web/src/styles/tokens.css`; `design/tokens.css` queda solo como referencia.

## Reglas de color

1. **Ámbar = "estuve aquí".** Como relleno solo marca lugares visitados y la acción principal ("Nuevo recuerdo", "Guardar").
2. **Escala:** el mismo ámbar con relleno al ~40% y borde sólido.
3. **Lista de deseos:** contorno turquesa punteado, nunca relleno.
4. **Por descubrir:** color de tierra neutro.
5. En tema claro el ámbar **no se usa como texto**. Para texto se usa `accent-text` (#8A5A00, 5.9:1 sobre blanco).

## Tokens

| Token | Oscuro | Claro | Uso |
| --- | --- | --- | --- |
| `bg` | #0B1620 | #EEF1F4 | Fondo de página |
| `panel` | #122230 | #FFFFFF | Tarjetas y paneles |
| `line` | #24394A | #D6DEE5 | Bordes y divisores |
| `text` | #EEF2F4 | #0F1E2A | Texto principal |
| `text-sub` | #B5C4CF | #3E5263 | Texto de apoyo |
| `text-muted` | #9DB0BE | #556A7B | Etiquetas y metadatos |
| `map-ocean` | #0E1B25 | #E2E9EE | Océano / fondo del mapa |
| `map-land` | #1C2B38 | #FFFFFF | Tierra sin visitar |
| `map-land-line` | #2C4052 | #C3CFD9 | Fronteras |
| `accent` | #F4B740 | #F2AE2E | Visitado, botón principal |
| `on-accent` | #1A1204 | #1A1204 | Texto sobre ámbar |
| `accent-text` | #F4B740 | #8A5A00 | Ámbar usado como texto |
| `wish` | #7FD8CE | #167468 | Lista de deseos |
| `inverse` / `on-inverse` | #EEF2F4 / #0B1620 | #0F1E2A / #FFFFFF | Chips y pestañas seleccionadas |

Extras: en oscuro, los países visitados llevan un halo (desenfoque gaussiano de ~6px) y las ciudades visitadas son puntos de luz. En claro no hay halos: los países visitados llevan borde #B87A06.

## Tipografía (Google Fonts)

- **Bricolage Grotesque** 700–800: títulos y cifras grandes (ej. "12" de 195 países).
- **Instrument Sans** 400–600: texto, anécdotas y botones.
- **IBM Plex Mono** 400–500: fechas, códigos de país, coordenadas y etiquetas en mayúsculas.

## Forma

- Radios: 28px en contenedores de mapa, 20–24px en tarjetas, 999px en botones y chips.
- Objetivos táctiles de al menos 44px.
- Iconos de línea (trazo de 2px), sin emoji.
- El mapa es el protagonista: los paneles flotan a los lados o encima, nunca lo tapan por completo.

## Pantallas y comportamiento

### 1. Mi mapa (inicio) — `Main.dc.html`
- Encabezado: logo, vistas (Mundo / Mi país / Ciudades / Monumentos), búsqueda, "Compartir mi mapa", "Nuevo recuerdo", botón de tema (sol/luna) y perfil.
- Panel izquierdo: cifra de países, **195 puntos** (uno por país; los visitados encendidos, las escalas como punto hueco), progreso por continente, estadísticas y lista de deseos.
- Mapa mundial (proyección Equal Earth) con capas que se activan o desactivan (países, ciudades, monumentos, deseos), zoom y botón de globo 3D.
- Al pasar o hacer clic sobre un país visitado aparece una tarjeta con fotos, fechas y conteos, y el botón "Abrir viaje".
- **Reproduce tu historia:** botón de reproducir y selector de años; el mapa se va encendiendo año por año.
- Tira horizontal de viajes con portada, código de país y visibilidad.

### 2. Detalle de viaje — `Viaje.dc.html`
- Mapa de la región con la ruta (curvas punteadas en ámbar) y paradas numeradas.
- **Sincronía mapa–bitácora:** al seleccionar una parada en el mapa o en la lista, se resalta en ambos lados y se expande su entrada con fotos.
- Selector de visibilidad del viaje (Privado / Con enlace / Público), "Momento favorito" y aviso de escalas del viaje.

### 3. Mi país — `Mexico.dc.html`
- México por estados con pines de monumentos; al elegir uno aparece su tarjeta.
- Pestañas: Estados (visitados / por descubrir), Ciudades (con número de viajes), Monumentos.
- **Pasaporte de monumentos:** sellos circulares para los visitados y sellos punteados en turquesa para los sugeridos.

### 4. Nuevo recuerdo — `Recuerdo.dc.html`
- Ventana sobre el mapa atenuado. Izquierda: zona para arrastrar fotos y cuadrícula con indicador de ubicación; la primera foto es la portada.
- Derecha: lugar detectado con minimapa y opción de cambiarlo, tipo de visita (Estancia / Escala), vínculo a viaje y monumento sugerido, anécdota y visibilidad.
- Botón principal: "Guardar y encender en el mapa".

## Datos geográficos y créditos

- Países: Natural Earth (dominio público). En el mapa, vía el paquete npm `world-atlas` 50m (la de 110m no trae países chicos como Vaticano o Andorra); los que no se alcanzan a ver se dibujan además como punto. En PostGIS, Natural Earth 10m.
- Estados de México: **Natural Earth admin-1** (dominio público), tanto para el mapa como para PostGIS. Las maquetas usaron `@svg-maps/mexico` (CC BY 4.0), pero ese paquete trae trazos ya proyectados y no sirve para geocodificar ni para proyectar con D3.
- Ciudades para geocodificación inversa: GeoNames **`cities5000`** (CC BY 4.0: requiere atribución visible en la app). La de 15000 no incluye lugares como Hakone.
