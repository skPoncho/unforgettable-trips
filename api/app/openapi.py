"""Imprime el OpenAPI de la api (lo usa `make gen-api` para generar los tipos del web)."""

import json

from app.main import app

if __name__ == "__main__":
    print(json.dumps(app.openapi(), ensure_ascii=False, indent=2))
