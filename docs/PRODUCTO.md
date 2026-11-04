# Huella · Producto

## Idea central

Una app web donde ves en mapas todo lo que has viajado y tu "progreso" conociendo el mundo y tu país. Cada lugar visitado se enciende en el mapa y, al abrirlo, muestra las fotos y anécdotas que tú mismo cargaste. Debe ser muy fácil de usar, con un diseño fluido e innovador donde el mapa sea el protagonista.

## Usuarios

1. **Ahora:** Carlos, que carga sus propios viajes para probar la app.
2. **Después:** cualquier persona con cuenta, que registra sus viajes y decide qué compartir (perfil público o enlaces).

## Conceptos

| Concepto | Qué es |
| --- | --- |
| Usuario | Dueño de todo lo demás. Puede indicar su **ciudad de casa**. |
| Viaje | Agrupa paradas en un rango de fechas (ej. "Japón, primavera 2025"). Tiene visibilidad. |
| Parada / visita | Un lugar dentro de un viaje: ciudad (y por ende país y, en México, estado), con fechas y **tipo de visita**: `estancia` o `escala`. |
| Recuerdo | Fotos más anécdota ligadas a una parada (y opcionalmente a un monumento). Siempre vive dentro de un viaje. |
| Foto | Archivo en almacenamiento propio, con fecha y ubicación leídas de su EXIF cuando existan. |
| Monumento | Lugar de un catálogo (zonas arqueológicas, sitios patrimonio, etc.). Visitarlo otorga un "sello" en el pasaporte. |
| Lista de deseos | Países (y después lugares) que el usuario quiere visitar. |

## Reglas de negocio

- **Un país cuenta como visitado** si el usuario tiene al menos una parada ahí, de tipo `estancia` o `escala`, **o si es el país de su ciudad de casa**.
- **Un estado de México cuenta como visitado** con la misma regla.
- **Ciudad de casa:** la ciudad, el estado y el país de residencia cuentan como visitados (como estancia) desde el inicio, aunque no haya paradas, y se muestran con la etiqueta "Casa".
- Las escalas suman al progreso, pero la interfaz las distingue (relleno tenue y borde sólido, etiqueta "Escala").
- **Progreso mundial:** sobre 195 países (193 miembros de la ONU más Vaticano y Palestina). Los totales por continente usados en las maquetas son América 35, Europa 44, Asia 48, África 54 y Oceanía 14. Es una convención a confirmar al cargar los datos. Los territorios y entidades fuera de los 195 (Groenlandia, Puerto Rico, Kosovo, Taiwán…) se pintan en el mapa pero no suman (a confirmar en la fase 1).
- **Progreso nacional:** 32 entidades federativas de México.
- **Visibilidad:** cada viaje es `privado` (solo el dueño), `enlace` (quien tenga el enlace) o `publico` (visible en el perfil público). Los recuerdos heredan la visibilidad del viaje y pueden hacerse **más privados, nunca más abiertos** (ej. un recuerdo privado dentro de un viaje público). Lo que se muestra es siempre la más restrictiva de las dos.
- **Recuerdo sin viaje:** si al guardar un recuerdo no se elige viaje, la app crea un viaje automático de una parada con el nombre del lugar y la fecha (ej. "Kioto · mar 2025"), que después se puede renombrar o fusionar con otro viaje.
- **Privacidad de fotos:** al mostrar fotos a terceros, servir copias sin metadatos de ubicación EXIF.
- Al guardar un recuerdo, la app **sugiere lugar y fecha** a partir del EXIF de las fotos y sugiere monumentos cercanos. El usuario siempre puede corregirlos.

## Pantallas (ver docs/DISENO.md)

1. **Mi mapa (inicio):** mapa mundial con países encendidos, contador de 195 puntos, progreso por continente, capas, leyenda, "reproduce tu historia" por año y tira de viajes.
2. **Detalle de viaje:** mapa con la ruta y paradas numeradas sincronizado con la bitácora por parada (fotos, anécdota, monumentos). Incluye control de visibilidad.
3. **Mi país:** México por estados, pestañas Estados / Ciudades / Monumentos y "pasaporte de monumentos" con sellos y sugeridos.
4. **Nuevo recuerdo:** ventana sobre el mapa para arrastrar fotos, lugar detectado, tipo de visita (estancia o escala), vínculo a viaje y monumento, anécdota y visibilidad.

## Fuera de alcance por ahora

- Subdivisiones de países distintos de México.
- App móvil nativa.
- Funciones sociales más allá de compartir (comentarios, seguidores, likes).

## Datos de ejemplo

Los viajes, anécdotas, cifras y fotos de las maquetas son **ficticios**. Sirven como datos semilla de desarrollo, no como contenido real.
