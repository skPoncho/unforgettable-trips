# Prompt para la primera sesión de Claude Code

Abre Claude Code en la carpeta del proyecto, en modo plan, y pega esto:

---

Vamos a construir Huella, una app web de diario de viajes centrada en mapas. En este repo ya están el contexto (`.claude/CLAUDE.md`), el producto (`docs/PRODUCTO.md`), el diseño (`docs/DISENO.md`, `design/`) y un plan borrador (`docs/PLAN-PROPUESTO.md`).

Todavía no escribas código. Quiero que:

1. Leas todo lo anterior, incluidas las maquetas de `design/pantallas/`.
2. Me hagas las preguntas necesarias para cerrar las "Decisiones abiertas" de `.claude/CLAUDE.md`. Para cada una, dame tu recomendación y por qué.
3. Con mis respuestas, conviertas el borrador en `docs/PLAN.md`: fases con tareas pequeñas (que cada una quepa en una sesión), dependencias, y un criterio de "hecho" verificable para cada fase.
4. Propongas el modelo de datos inicial (tablas y relaciones) respetando las reglas de negocio de `docs/PRODUCTO.md`.
5. Actualices `.claude/CLAUDE.md` con las decisiones tomadas.

Cuando aprobemos el plan, empezamos con la fase 0.

---

## Para cada fase después

```
Lee docs/PLAN.md y .claude/CLAUDE.md. Vamos con la fase N. Propón el plan detallado de esta fase antes de tocar código; al terminar, corre las pruebas, muéstrame cómo verla en el navegador y prepara el commit.
```
