# Datos de catálogo

- `countries.csv`: países y territorios. Generado una vez desde Natural Earth 10m admin-0 (v5.1.2) y corregido a mano al español de México. Solo los que tienen `counts_in_progress=true` suman al progreso (195: 35/44/48/54/14). Los territorios llevan `sovereign_iso3` cuando dependen de un país; los disputados (Kosovo, Taiwán, Sáhara Occidental) no.
- `subdivisions.csv`: los 32 estados de México. `ne_iso_3166_2` es el código que usa Natural Earth (Ciudad de México aún aparece como `MX-DIF`) y `geonames_admin1` enlaza las ciudades de GeoNames.
- `natural_earth.json`: cómo se mapean las piezas de Natural Earth y de `world-atlas` al catálogo (piezas que se funden con otro país o se descartan). Lo usan `make load-geo` y `make build-geo`.

Las geometrías y las ciudades no viven aquí: se descargan a la caché (`~/.cache/huella/geo`) con `make load-geo` / `make build-geo`.
