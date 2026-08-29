# CareSignal demo runbook

## The two-minute story

### 0:00–0:20 — Show the blind spot

Say:

> Today, three room bells look identical. Staff cannot tell whether a resident wants water, needs help getting to the bathroom, or may be in immediate danger.

Show two synthetic requests already on the dashboard: a routine water request and a facility question answered by voice.

### 0:20–1:05 — Place the real call

Open `/resident` on the phone and tap the large button. Say:

> My left arm suddenly feels numb and I am having trouble speaking.

The expected result is a new `Immediate response` item at the top of the dashboard. It must show the original words and a non-diagnostic summary. Do not call it a stroke in the UI or pitch.

### 1:05–1:30 — Show the human handoff

Click `Acknowledge`, then `On my way`.

Say:

> The AI did not decide care. It supplied context, failed open, and made the handoff visible until a person took ownership.

### 1:30–1:50 — Show avoided interruption

Point to the answered activity:

> A resident asked when lunch is. CareSignal answered from verified facility information and logged the interaction without putting another trip into the queue.

### 1:50–2:00 — Close

Say:

> We do not replace nurses or emergency infrastructure. We turn a bell without context into a clear, acknowledged request, so the right person can reach the right room first.

## Test phrases and expected routing

| Resident says | Expected result |
|---|---|
| “When is lunch?” | Answered by voice; no active staff request |
| “Could I have some water?” | Routine request |
| “I need help getting to the bathroom.” | Prompt support |
| “My chest hurts and I cannot breathe well.” | Immediate response; no diagnosis |
| “Please send a nurse.” | At least prompt support |
| Unclear or low-confidence speech | Immediate response for human review |

## Pre-demo checklist

- Finish the Guava organization package setup; `guava org list` must stop returning `package_setup_unfinished`.
- Confirm an inbound number with `guava numbers list`.
- Put the number in `.env` as `GUAVA_AGENT_NUMBER=+1...`.
- Start the dashboard and open the tokenized staff URL printed by `make demo` on the presentation laptop.
- Open the resident page on the phone over the same Wi-Fi.
- Place one real call before the eligibility freeze and verify it appears in Guava Conversations.
- Run all six test phrases once.
- Load demo cases before judging.
- Disable laptop and phone sleep; connect both to power.
- Keep the native phone dialer and Guava Conversations page open as fallbacks.

## Failure plan

| Failure | Recovery |
|---|---|
| Billing or number remains blocked | Go directly to Guava office hours; this cannot be solved in code. Use local chat only for development, not as the eligibility call. |
| Venue Wi-Fi blocks the phone path | Use phone cellular data for the call; keep the laptop on the best available connection. |
| Dashboard API is down | Restart the local service, then load synthetic demo cases. The agent writes failed handoffs to `agent/fallback_intakes.jsonl`. |
| Live extraction is slow | Use the shortest urgent phrase above and do not add extra required fields. |
| The live call fails during judging | Show the already completed real call in Guava Conversations, then run the same flow through terminal chat while narrating the transport failure honestly. |
| A request is classified too low | The deterministic safety rules should raise it. If not, state that the result is a prototype failure; do not rationalize it as safe. |

## Pitch language to avoid

- “CareSignal detects strokes.”
- “The AI decides who needs help first.”
- “This replaces the call bell.”
- “This app is HIPAA/HITRUST compliant.”
- “The system learns the resident automatically.”

Prefer: “possible urgent symptoms,” “response recommendation,” “augments the existing call system,” “built on a platform designed for regulated voice,” and “staff-approved logbook suggestions.”
