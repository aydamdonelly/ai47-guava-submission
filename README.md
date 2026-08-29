# CareSignal

CareSignal turns an anonymous room bell into a structured, acknowledged request, so care teams know why a resident called before they walk to the room.

The hackathon demo is intentionally narrow and end to end:

```text
phone as room button → real Guava call → structured intake
→ deterministic safety override → SQLite → live care-team dashboard
```

It is a workflow-routing prototype, not a diagnostic or autonomous clinical-triage system. Only verified facility questions can be answered without staff; unclear or potentially clinical requests fail open to immediate human review.

## Current setup status

- Guava CLI `0.40.0` is installed and authenticated on this laptop.
- Backend, dashboard, mobile room interface, synthetic demo data, and the Guava agent are implemented.
- Local tests and production frontend build pass.
- Guava currently returns `package_setup_unfinished`, so organization access and an inbound number remain blocked until the account package is enabled in the Guava dashboard or by the event team.

The event handout's `python agent.py` command is stale for the current CLI. This project uses `main.py` inside `agent/` and runs it with `guava run agent`.

## One-time setup

```bash
make setup
```

Then resolve the external Guava account step:

```bash
guava org list
guava numbers list
```

If either command returns `package_setup_unfinished`, finish the package setup at [app.goguava.ai](https://app.goguava.ai) or take it directly to the Guava office-hours desk. Do not purchase a number until the event team confirms whether one is included.

Once a number exists, add it to the already-created `.env` file:

```dotenv
GUAVA_AGENT_NUMBER=+1...
```

The ignored local `.env` already contains a random demo token. If recreating it from `.env.example`, replace the placeholder with a random value, for example from `uuidgen`. The token protects transcripts and write controls while the resident page is exposed on venue Wi-Fi; it is a demo boundary, not production authentication.

## Run the complete demo

After the number is configured:

```bash
make demo
```

That command builds the web app, resets synthetic demo data, starts the local dashboard, then listens for inbound calls through Guava. Open:

- Care-team dashboard: use the tokenized URL printed by the start script
- Room device: `http://<laptop-LAN-IP>:8000/resident`

Find the laptop's Wi-Fi address on macOS with:

```bash
ipconfig getifaddr en0
```

The phone and laptop must be on the same local network only to load the room page. Tapping the button opens the native dialer; the actual voice path is a real telephone call.

Press `Ctrl-C` once to stop both the agent and dashboard.

## Develop without the phone number

Use two terminals. First start the dashboard:

```bash
make seed
make serve
```

`make serve` loads `.env`, binds only to localhost, and prints the secured dashboard URL. The agent targets below load the same token before they connect to the API.

Then use Guava terminal chat or browser voice:

```bash
make agent-chat
# or
make agent-webrtc
```

The Guava account package still has to be active for cloud-backed voice and chat sessions.

## Verify

```bash
make test
```

The high-value safety cases cover red-flag overrides, low confidence, unknown information, human requests, status progression, logbook approval, API persistence, the exact Guava payload, and frontend serving.

## Repository map

```text
agent/                    Guava 0.40 voice agent and allowlisted facility facts
care_signal/              FastAPI, SQLite, routing policy, and demo data
web/                      React/Tailwind dashboard and mobile call button
tests/                    API and deterministic safety-policy tests
docs/PRODUCT_BRIEF.md     Scope, risks, non-goals, and post-demo roadmap
docs/DEMO_RUNBOOK.md      Two-minute script, test phrases, and failure plan
docs/HACKATHON_NOTES.md   Schedule, rules, judging, and current account status
scripts/start_demo.sh     One-command live demo
```

## Guava references

- [Current quickstart](https://goguava.ai/docs/quickstart)
- [Agent API](https://goguava.ai/docs/agent)
- [Structured tasks](https://goguava.ai/docs/tasks)
- [Inbound architecture](https://goguava.ai/docs/architecture-overview)
- [Language mode limitations](https://goguava.ai/docs/set-language-mode)
