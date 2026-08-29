from __future__ import annotations

import os

import uvicorn


def main() -> None:
    uvicorn.run(
        "care_signal.app:app",
        host=os.getenv("CARE_SIGNAL_HOST", "127.0.0.1"),
        port=int(os.getenv("CARE_SIGNAL_PORT", "8000")),
        reload=os.getenv("CARE_SIGNAL_RELOAD", "").lower() in {"1", "true", "yes"},
    )


if __name__ == "__main__":
    main()
