# CareSignal product brief

## One-line pitch

CareSignal turns an anonymous room bell into a structured, acknowledged request so care teams know why a resident called before they walk to the room.

## The problem

A conventional call bell transmits urgency without context. If three residents call at once, staff cannot see whether someone wants water, needs toileting support, or may be in immediate danger. Every signal looks the same, staff walk rooms in a poor order, and routine information questions compete with hands-on care.

## The demo product

The resident's phone stands in for a room-mounted call device. One large button starts a real inbound phone call to a Guava agent. The resident speaks naturally. Guava extracts a concise handoff, while deterministic server-side rules can only raise the suggested response level. The request appears in a care-team queue with the resident's own words, confidence, rationale, timer, and acknowledgement workflow.

Verified, non-clinical questions such as meal times or the evening activity can be answered by voice from a small allowlisted knowledge set. The backend only auto-closes an exact answer from that positive list; every paraphrase, refusal, unknown answer, or missing answer reaches staff. Answered calls still appear in the activity log but do not enter the active care queue.

Potential long-term facts are never learned silently. The agent may create a logbook suggestion, including its source quote, and a staff member must approve or dismiss it.

## End-to-end flow

```text
phone button
  → real inbound Guava call
  → structured fields from natural speech
  → deterministic fail-open routing rules
  → local SQLite event store
  → live care-team dashboard
  → staff acknowledgement and resolution
```

The Guava agent and dashboard run locally on the same laptop. Guava connects outward for the phone channel, so the laptop does not need a public inbound endpoint or tunnel. A per-run demo token protects transcript and mutation APIs when the resident page is exposed on the venue LAN; this is a hackathon boundary, not production authentication.

## What the system decides

CareSignal makes a workflow recommendation, not a medical decision:

- `Immediate response`: possible danger, a clinical concern, unclear speech, or low confidence.
- `Prompt support`: hands-on personal care or an explicit request for staff.
- `Routine request`: a non-clinical comfort request.
- `Answered by voice`: only a verified facility-information question that was answered completely.

Server rules are fail-open: they may override the model upward, never downward. Staff remain responsible for the response and see the original wording beside the summary.

## Safety and trust boundaries

- No diagnosis, treatment advice, or claim that danger was detected or ruled out.
- No request for a resident to self-assess clinical severity.
- Silence, unclear language, symptoms, falls, pain, medication questions, and explicit requests for a person always reach staff.
- No continuously open microphone. Interaction starts with an intentional phone action and an audible AI/recording disclosure.
- No automatic charting or silent profile updates. Logbook suggestions require human review.
- The physical call system and emergency services remain available as fallbacks.
- The demo uses synthetic residents and data only.
- Care-team API access requires the local demo token; production would require real identities, roles, and sessions.
- Guava's platform certifications do not automatically certify this prototype or its complete workflow.
- German is supported technically, but the demo must not claim a compliant German healthcare deployment.

## Deliberate non-goals for the hackathon

- autonomous clinical triage
- EHR integration or production charting
- real resident data
- always-on room monitoring
- production call-button hardware
- SIP, SMS, or multi-site routing
- proof of three simultaneous calls on an unverified plan
- claims of HIPAA, HITRUST, medical-device, or care-home compliance for the full app

## Why this scope fits the judging criteria

- **Functionality:** one real call produces one visible, actionable care-team item.
- **Technical complexity:** live voice, structured extraction, deterministic overrides, persistence, and stateful acknowledgement form one end-to-end system.
- **Creativity:** the phone becomes a physical call-button surrogate without pretending it is production hardware.
- **Impact:** staff gain context before walking, while routine questions can be resolved immediately.
- **User experience:** residents speak naturally; staff get a queue rather than a transcript dump.
- **Pitch:** the before/after contrast is visible in under two minutes.

## Roadmap after the demo

### Phase 1 — Workflow validation

- Shadow existing call-bell workflows without changing response order.
- Test with nurses, care assistants, residents, accessibility specialists, and clinical safety owners.
- Measure acknowledgement time, unnecessary room trips, missed/overridden suggestions, and staff trust.
- Validate noisy rooms, weak speech, aphasia, cognitive impairment, accents, and hearing loss.

### Phase 2 — Controlled pilot

- Integrate with the existing nurse-call system rather than replacing it.
- Add authenticated staff identities, escalation timers, audit logs, on-call routing, and device health.
- Complete privacy, retention, security, BAA/DPA, clinical-risk, and jurisdiction-specific reviews.
- Require human approval for all record updates.

### Phase 3 — Production hardening

- Redundant network and power paths, hardware certification, monitoring, incident response, and downtime procedures.
- Formal false-negative testing and site-specific escalation policies.
- EHR/care-plan integration only after data governance and staff workflow validation.
