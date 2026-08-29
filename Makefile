.PHONY: setup build test seed serve agent-chat agent-webrtc agent-phone demo

setup:
	uv sync --extra dev
	uv sync --project agent
	npm --prefix web ci

build:
	npm --prefix web run build

test: build
	uv run pytest
	uv run ruff check care_signal tests scripts/seed_demo.py
	uv run ruff format --check care_signal tests scripts/seed_demo.py
	uv run --project agent ruff check agent

seed:
	@set -a; [ ! -f .env ] || . ./.env; set +a; uv run python scripts/seed_demo.py

serve: build
	@set -a; [ ! -f .env ] || . ./.env; set +a; \
		if [ -z "$$CARESIGNAL_DEMO_TOKEN" ]; then \
			echo "Set CARESIGNAL_DEMO_TOKEN in .env before starting the dashboard." >&2; \
			exit 2; \
		fi; \
		echo "Dashboard: http://127.0.0.1:8000/?token=$$CARESIGNAL_DEMO_TOKEN"; \
		CARE_SIGNAL_HOST=127.0.0.1 uv run care-signal

agent-chat:
	@set -a; [ ! -f .env ] || . ./.env; set +a; guava run agent -- --chat

agent-webrtc:
	@set -a; [ ! -f .env ] || . ./.env; set +a; guava run agent -- --webrtc

agent-phone:
	@set -a; [ ! -f .env ] || . ./.env; set +a; guava run agent -- --phone

demo:
	./scripts/start_demo.sh --phone
