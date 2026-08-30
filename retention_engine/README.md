# Smartset Retention Engine

Smartset is a fictional subscription nutrition tracker. This hackathon demo uses Guava to
contact customers after a cancellation or a sharp usage drop, run a short adaptive interview,
and turn qualitative answers into structured retention insights.

The call path is Guava-native: `Agent.call_phone(from_number, to_number, variables)`. Twilio,
ngrok, webhooks, and a public server are not required.

## Setup

Prerequisites:

- Python 3.11+ and `uv`
- Guava CLI login with package setup completed
- A Guava outbound number provisioned for the account
- Explicit permission from the person receiving any live call

```bash
cd retention_engine
uv sync --dev
guava login
cp .env.example .env
```

Keep real phone numbers only in the untracked `.env` file. If Guava reports
`package_setup_unfinished`, finish account setup in the dashboard or ask the event team before
attempting a live call.

## Demo workflow

Create idempotent sample interview results, inspect aggregate insights, or show the latest
attempt:

```bash
uv run python main.py seed
uv run python main.py insights
uv run python main.py latest
```

Exercise selection and persistence without calling anyone:

```bash
uv run python main.py dry-run --contact demo-dropoff
```

Role-play the interview in the terminal through Guava:

```bash
uv run python main.py chat --contact demo-dropoff
```

## Authorized live demo

Set `GUAVA_AGENT_NUMBER`, `DEMO_TARGET_PHONE`, and optionally `DEMO_FIRST_NAME` in `.env`, then
export them into the current shell and start the call:

```bash
set -a
source .env
set +a
uv run python main.py call --contact demo-dropoff --authorized-live-demo
```

The live command requires all of the following: an eligible contact fixture, a runtime target
number, and the explicit `--authorized-live-demo` guard. It never dials the reserved number in
`contacts.demo.csv`.

`contacts.demo.csv` contains fictional data and reserved, non-dialable phone numbers. The one
fixture marked as consented exists only to exercise the software gate; it is not evidence of
real-world consent. Never call imported contacts without documented permission, honor
do-not-call requests immediately, disclose that the caller is an AI assistant, and follow the
rules that apply to the recipient and caller locations.
