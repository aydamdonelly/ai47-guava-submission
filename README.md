# Smartset Retention Engine

Smartset is a fictional subscription nutrition tracker built for Guava Build Night SF. When a
customer cancels or their usage drops off, Smartset places a real outbound Guava call, runs a
short adaptive conversation, and turns what the person actually says into a structured retention
decision.

The point of the demo is that the conversation is **not** a script. The agent has to discover the
customer's own goal, find out whether that goal still matters, locate the real barrier, and prove
the barrier is causal before any incentive is allowed to exist.

```text
natural-language workflow edit → Claude rewrites the branch
→ real Guava call → goal → still relevant? → root barrier → causal check
→ gated offer → email
```

## The call flow

Each stage is its own Guava task, and every transition is a decision in our code, not a prompt
the model is free to reinterpret.

| Stage | What the agent must establish |
| --- | --- |
| `reach_person` | The right person is on the line. Voicemail hangs up. |
| `permission` | Explicit consent, after disclosing that this is an AI and may be transcribed. |
| `goal_discovery` | What the customer originally wanted, in their own words. Nothing is suggested to them. |
| `goal_relevance` | Whether that goal still matters today. |
| `goal_changed` | If it does not: understand what changed, then end. No retention attempt. |
| `interview` | One open question to find the real barrier. The reason code is inferred silently. |
| `causal_validation` | Whether removing that barrier would actually change their intent. |
| `offer` | Only reachable when a workflow edit configured an offer, the barrier is price, and intent is positive. |

Two deliberate constraints:

- The customer's stored goal is removed from model context before the call. If the fixture goal
  stayed in context, the agent could recite it and the discovery step would be theatre.
- The offer gate is evaluated in Python, not by the model. A model that wants to offer a discount
  when price was never the barrier is overruled.

## Layout

```text
retention_engine/   Guava agent, call flow, reason taxonomy, SQLite persistence, CLI
smartset_api/       FastAPI: workflow interpretation, call start, live events, insight questions
web/                React dashboard, workflow canvas, live transcript and agent state
```

`smartset_api` never dials anyone itself. It spawns `retention_engine.main call-context` as a
subprocess with the `--authorized-live-demo` guard and reads back the JSONL event log that the
frontend polls.

## Setup

Prerequisites: Python 3.11+, `uv`, Node 20+, a Guava CLI login with package setup completed, and
a provisioned Guava outbound number.

```bash
make setup
cp retention_engine/.env.example retention_engine/.env
```

Fill in `retention_engine/.env`. It is untracked and it is the only place real values belong:

```dotenv
GUAVA_AGENT_NUMBER=+1...      # your Guava outbound number
DEMO_TARGET_PHONE=+1...       # the one number that consented to be called
ANTHROPIC_API_KEY=sk-ant-...  # workflow edits and insight answers
RESEND_API_KEY=re_...         # optional, sends the offer email
DEMO_EMAIL_TO=you@example.com # optional, recipient for that email
```

## Run

```bash
make serve   # backend plus the built frontend on http://127.0.0.1:8000
```

For hot reload, run the backend and Vite side by side:

```bash
make dev
npm --prefix web run dev   # http://127.0.0.1:5173, proxies /api to port 8000
```

`GET /api/health` reports `callReady` and lists what is still missing, so you can confirm the
demo is wired up without calling anyone.

## The two-minute demo

1. Open **Why customers churn** and type a workflow edit, for example
   `Only offer one free month if price is the actual problem`.
2. Claude rewrites the branch and the new gate appears in the canvas.
3. Press **Call** on a customer. That places one real Guava call to `DEMO_TARGET_PHONE`.
4. Transcript, agent state, and the highlighted workflow path update live from the call's events.
5. Say price is the problem and that a lower price would bring you back: the offer is presented
   and, on acceptance, emailed. Say anything else: no offer is ever mentioned.

## Verify

```bash
make test
```

Builds the frontend, lints the API, then runs the engine's tests: normalization, the consent
gate, goal discovery, the obsolete-goal exit, causal validation before persistence, the
price-only offer gate, partial persistence on hangup, and the refusal of medical and account
questions.

## Calling people responsibly

`contacts.demo.csv` is fictional and uses reserved, non-dialable numbers. The one fixture marked
as consented exists to exercise the software gate; it is not evidence of real consent. A live
call requires an eligible contact, a runtime target number, and the explicit
`--authorized-live-demo` flag. Disclose that the caller is an AI, honor do-not-call immediately,
and follow the rules that apply where the caller and the recipient are.

## Guava references

- [Quickstart](https://goguava.ai/docs/quickstart)
- [Agent API](https://goguava.ai/docs/agent)
- [Structured tasks](https://goguava.ai/docs/tasks)
- [Language mode limitations](https://goguava.ai/docs/set-language-mode)
