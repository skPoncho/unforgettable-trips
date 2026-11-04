# Atajos de docker compose. Todo se ejecuta dentro de los contenedores.
COMPOSE := docker compose
API_RUN := $(COMPOSE) run --rm api
WEB_RUN := $(COMPOSE) run --rm --no-deps web

.DEFAULT_GOAL := help
.PHONY: help dev stop down logs test test-api test-web lint lint-api lint-web format migrate seed build-geo load-geo geo-cache shell-api shell-web

help: ## Muestra esta ayuda
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-11s %s\n", $$1, $$2}'

.env:
	cp .env.example .env

# Caché de descargas geográficas, fuera del repo (se monta en api y geo).
HOST_GEO_CACHE ?= $(HOME)/.cache/huella/geo
export HOST_GEO_CACHE

geo-cache:
	@mkdir -p $(HOST_GEO_CACHE)

dev: .env geo-cache ## Levanta db, api y web (localhost:4200 y localhost:8000)
	$(COMPOSE) up --build

stop: ## Detiene los contenedores
	$(COMPOSE) stop

down: ## Detiene y borra los contenedores (conserva los datos)
	$(COMPOSE) down

logs: ## Sigue los logs de todos los servicios
	$(COMPOSE) logs -f

test: test-api test-web ## Pruebas de api y web

test-api: geo-cache
	$(API_RUN) pytest

test-web:
	$(WEB_RUN) npm test

lint: lint-api lint-web ## Lint y formato (solo revisa) de api y web

lint-api:
	$(COMPOSE) run --rm --no-deps api sh -c "ruff check . && ruff format --check ."

lint-web:
	$(WEB_RUN) sh -c "npm run lint && npm run format:check"

format: ## Aplica el formato en api y web
	$(COMPOSE) run --rm --no-deps api sh -c "ruff check --fix . && ruff format ."
	$(WEB_RUN) npm run format

migrate: ## Aplica las migraciones de Alembic
	$(API_RUN) alembic upgrade head

seed: ## Carga datos semilla (llega en la fase 2)
	@echo "make seed llega en la fase 2."

build-geo: geo-cache ## Genera web/public/geo/*.topo.json (mundo y México)
	$(COMPOSE) run --rm geo

load-geo: geo-cache ## Carga países, estados y ciudades en PostGIS (idempotente)
	$(API_RUN) python -m app.geo.load

shell-api: ## Terminal dentro del contenedor api
	$(COMPOSE) run --rm api bash

shell-web: ## Terminal dentro del contenedor web
	$(WEB_RUN) bash
