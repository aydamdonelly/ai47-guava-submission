from __future__ import annotations

import os

import uvicorn


def main() -> None:
    uvicorn.run(
        "smartset_api.app:app",
        host=os.getenv("SMARTSET_HOST", "127.0.0.1"),
        port=int(os.getenv("SMARTSET_PORT", "8000")),
        reload=os.getenv("SMARTSET_RELOAD", "").lower() in {"1", "true", "yes"},
    )


if __name__ == "__main__":
    main()
