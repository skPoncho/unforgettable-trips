# Huella · kit de arranque

Todo lo que Claude Code necesita para planear y construir la app a partir del diseño.

```
.claude/CLAUDE.md                 Contexto del proyecto (Claude Code lo lee solo al abrir la carpeta)
docs/PRODUCTO.md          Qué hace la app y sus reglas
docs/DISENO.md            Sistema visual, pantallas y comportamiento
docs/PLAN-PROPUESTO.md    Borrador de fases (Claude Code lo convierte en docs/PLAN.md)
docs/PROMPT-INICIAL.md    Lo que pegas en la primera sesión
design/tokens.css         Colores, fuentes y radios de ambos temas
design/pantallas/         Maquetas de referencia (leer, no ejecutar)
design/mapas/             Mapas SVG de ejemplo, oscuro y claro
scripts/generar-mapas.mjs Cómo se generaron los mapas (d3-geo + TopoJSON)
```

## Pasos

1. Descomprime esta carpeta donde vivirá el proyecto, por ejemplo `~/proyectos/unforgettable-trips`.
2. Inicia git y haz el primer commit:
   ```bash
   cd ~/proyectos/unforgettable-trips
   git init && git add . && git commit -m "Kit inicial de diseño y producto"
   ```
   Opcional: súbelo a un repo privado de GitHub para poder usar Claude Code también desde la web.
3. Abre Claude Code en esa carpeta en modo plan:
   ```bash
   claude --permission-mode plan
   ```
   Dentro de una sesión ya abierta también puedes presionar `Shift+Tab` hasta ver `⏸ plan mode on`.
4. Pega el prompt de `docs/PROMPT-INICIAL.md`, responde sus preguntas y revisa el plan que proponga.
5. Aprueba el plan y haz commit de `docs/PLAN.md` y `.claude/CLAUDE.md`.
6. Avanza **una fase por sesión**: plan → implementación → pruebas → revisarla en el navegador → commit.

## Notas

- Si Claude Code necesita ver una pantalla, arrastra una captura del lienzo de diseño a la conversación.
- Para regenerar los mapas: `npm i d3-geo topojson-client world-atlas @svg-maps/mexico` y luego `node scripts/generar-mapas.mjs` desde la raíz.
- Los estados de México vienen de `@svg-maps/mexico` (CC BY 4.0): la app final debe mostrar la atribución.
