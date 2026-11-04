# Huella · api (FastAPI). La etapa `prod` llega en la fase 9.
FROM python:3.13-slim AS base

COPY --from=ghcr.io/astral-sh/uv:0.9.30 /uv /uvx /bin/

# El entorno virtual vive fuera de /app para que el volumen del código no lo tape.
ENV UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/opt/venv/bin:$PATH"

WORKDIR /app

FROM base AS dev

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project

COPY . .

EXPOSE 8000
# Migra al arrancar y recarga al cambiar el código montado.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"]
