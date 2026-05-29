"""
init_db.py — create all database tables and optionally seed initial admin accounts.

Usage:
    python init_db.py                          # create tables only (idempotent)
    python init_db.py --db sqlite:///other.db  # custom database URL
    python init_db.py --db postgresql://user:pass@host/dbname

    # Seed the initial Super Admin and IT Admin on a fresh database:
    python init_db.py --seed-admins \\
        --super-admin-name "Alice"  --super-admin-email "alice@example.com" \\
        --it-admin-name   "Bob"     --it-admin-email   "bob@example.com"

The script is idempotent — it uses CREATE TABLE IF NOT EXISTS and skips seeding
accounts that already exist (matched by email).

Seeded accounts are created with active=False and no google_sub.  Each admin
activates their own account automatically on their first Google sign-in.
"""

import argparse
import sys
from datetime import datetime, timezone

from sqlalchemy import create_engine, inspect
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy import JSON


def _patch_jsonb_for_sqlite(engine):
    """Swap JSONB → JSON on the tickets table so SQLite doesn't error."""
    from database.models import Ticket
    col = Ticket.__table__.c.get("extracted_entities")
    if col is not None and isinstance(col.type, JSONB):
        col.type = JSON()


def _seed_admins(db_url: str, admins: list[dict]) -> None:
    """Insert Role + StaffUser rows for each admin, skipping existing emails."""
    from sqlalchemy.orm import Session
    from database.models import Role, StaffUser
    from constants import ROLE_TYPE

    engine = create_engine(db_url)
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds")

    with Session(engine) as db:
        for admin in admins:
            role_type: ROLE_TYPE = admin["role_type"]
            name: str            = admin["name"]
            email: str           = admin["email"]

            if db.query(StaffUser).filter(StaffUser.email == email).first():
                print(f"  skip  {email!r} — already exists")
                continue

            # Find or create the Role row.
            role = (
                db.query(Role)
                .filter(Role.role_type == role_type, Role.department_name == None)  # noqa: E711
                .first()
            )
            if role is None:
                role = Role(role_type=role_type, department_name=None)
                db.add(role)
                db.flush()

            user = StaffUser(
                role_id=role.id,
                name=name,
                email=email,
                google_sub=None,
                active=False,   # activated automatically on first Google sign-in
                created_at=now,
                updated_at=now,
            )
            db.add(user)
            db.commit()
            print(f"  seeded {role_type.value!r:20s} {email!r}")


def main():
    parser = argparse.ArgumentParser(description="Initialise database tables.")
    parser.add_argument(
        "--db",
        default="sqlite:///application.db",
        help="SQLAlchemy database URL (default: sqlite:///application.db)",
    )
    # Seed flags
    parser.add_argument(
        "--seed-admins",
        action="store_true",
        help="Seed the initial Super Admin and IT Admin accounts",
    )
    parser.add_argument("--super-admin-name",  default="Super Admin")
    parser.add_argument("--super-admin-email", default=None)
    parser.add_argument("--it-admin-name",     default="IT Admin")
    parser.add_argument("--it-admin-email",    default=None)
    args = parser.parse_args()

    db_url: str = args.db
    is_sqlite = db_url.startswith("sqlite")

    print(f"Target: {db_url}")

    # Import all models so SQLAlchemy registers them with Base.metadata.
    import database.models  # noqa: F401
    from database.engine import Base

    engine = create_engine(db_url)

    if is_sqlite:
        _patch_jsonb_for_sqlite(engine)

    Base.metadata.create_all(engine)

    # Report tables.
    inspector = inspect(engine)
    tables    = inspector.get_table_names()
    print(f"\n{'Table':<25} {'Columns'}")
    print("-" * 60)
    for table in sorted(tables):
        cols = [c["name"] for c in inspector.get_columns(table)]
        print(f"  {table:<23} {', '.join(cols)}")

    print(f"\nDone. {len(tables)} table(s) ready.")

    # ── optional admin seeding ─────────────────────────────────────────────────
    if args.seed_admins:
        if not args.super_admin_email or not args.it_admin_email:
            print(
                "\nError: --seed-admins requires both --super-admin-email and --it-admin-email.",
                file=sys.stderr,
            )
            sys.exit(1)

        from constants import ROLE_TYPE
        print("\nSeeding admin accounts...")
        _seed_admins(
            db_url,
            [
                {
                    "role_type": ROLE_TYPE.SUPER_ADMIN,
                    "name":      args.super_admin_name,
                    "email":     args.super_admin_email,
                },
                {
                    "role_type": ROLE_TYPE.IT_ADMIN,
                    "name":      args.it_admin_name,
                    "email":     args.it_admin_email,
                },
            ],
        )
        print("Seeding complete.")


if __name__ == "__main__":
    main()
