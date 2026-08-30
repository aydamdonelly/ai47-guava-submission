.PHONY: setup build serve dev test engine-test

setup:
	uv sync --extra dev
	uv sync --project retention_engine --dev
	npm --prefix web ci

build:
	npm --prefix web run build

# Backend plus the production frontend on http://127.0.0.1:8000
serve: build
	uv run smartset-api

# Backend only. Run `npm --prefix web run dev` next to it for hot reload.
dev:
	SMARTSET_RELOAD=1 uv run smartset-api

test: build
	uv run ruff check smartset_api
	uv run ruff format --check smartset_api
	$(MAKE) engine-test

engine-test:
	uv run --project retention_engine pytest retention_engine/tests
	uv run --project retention_engine ruff check retention_engine
