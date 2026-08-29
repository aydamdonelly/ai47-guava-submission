# Guava Build Night SF notes

## Event

- Saturday, August 29, 2026
- House of AI, 40 Boardman Place, San Francisco
- Doors: 5:30 PM
- Kickoff: 6:00 PM sharp
- Build window: 6:30–8:30 PM
- Code freeze and science-fair judging: 8:30 PM
- Top-five stage demos: 9:30 PM
- Awards: 10:15 PM
- Networking: 10:30–11:00 PM
- Prize pool: up to $3,000 cash
- Teams: one to four people

## Eligibility and judging

The agent must place or answer at least one real telephone call. A browser or terminal demo that never rings does not satisfy the stated eligibility rule.

Judging criteria from the event brief:

- Functionality — heaviest weight
- Technical complexity — heaviest weight
- Creativity — equal standard weight
- Impact — equal standard weight
- User experience — equal standard weight
- Pitch and demo — lightest weight

Every team receives three science-fair judges, with a two-minute demo and one minute of questions. The top five receive a three-minute stage demo and two minutes of questions.

## Bring

- laptop and charger
- phone
- wired headphones if available
- photo ID

## Current CLI correction

The circulated event page shows `guava create`, `agent.py`, and `python agent.py`. Guava CLI 0.40 currently scaffolds `main.py` with `pyproject.toml`; the supported local command is `guava run <project-directory>`. This repository therefore uses:

```bash
guava run agent -- --phone
```

## Account blocker observed on this laptop

`guava login` completed successfully, but both `guava org list` and `guava numbers list` currently return HTTP 403 with `package_setup_unfinished`. Package/billing enablement and an inbound number must be resolved in the Guava dashboard or at the event's office-hours desk before the real-call test.
