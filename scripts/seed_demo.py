from __future__ import annotations

import argparse
import os

from care_signal.database import Database
from care_signal.demo import seed_demo


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed the CareSignal dashboard with synthetic data."
    )
    parser.add_argument(
        "--database",
        default=os.getenv("CARE_SIGNAL_DB_PATH", "care_signal.sqlite3"),
        help="SQLite database path (default: CARE_SIGNAL_DB_PATH or care_signal.sqlite3)",
    )
    parser.add_argument(
        "--keep-existing",
        action="store_true",
        help="Leave existing records untouched instead of resetting the demo.",
    )
    args = parser.parse_args()

    database = Database(args.database)
    database.initialize()
    records = seed_demo(database, reset=not args.keep_existing)
    print(
        f"CareSignal demo ready with {len(records)} intake records in {database.path}"
    )


if __name__ == "__main__":
    main()
