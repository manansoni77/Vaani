"""
init_db.py — create all database tables and optionally seed initial accounts.

Usage:
    python init_db.py                          # create tables only (idempotent)
    python init_db.py --db sqlite:///other.db  # custom database URL
    python init_db.py --db postgresql://user:pass@host/dbname

    # Seed the full initial set of system accounts:
    python init_db.py --seed \\
        --super-admin-name   "Alice"   --super-admin-email   "alice@example.com" \\
        --it-admin-name      "Bob"     --it-admin-email      "bob@example.com" \\
        --cc-admin-name      "Carol"   --cc-admin-email      "carol@example.com" \\
        --cc-user-name       "Dave"    --cc-user-email       "dave@example.com"

    # Only super-admin and IT-admin are required; cc-admin and cc-user are optional.

The script is idempotent — uses CREATE TABLE IF NOT EXISTS and skips accounts
that already exist (matched by email).

Seeded accounts are created with active=False and no google_sub.
Each user activates their account automatically on their first Google sign-in.
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


def _seed_roles(db_url: str) -> None:
    """Ensure Role rows exist for all non-department role types.

    DEPT_ADMIN and DEPT_USER are excluded — they are created on demand per
    department when users are registered via POST /users/register.
    """
    from sqlalchemy.orm import Session
    from database.models import Role
    from constants import ROLE_TYPE

    _SYSTEM_ROLES = [
        ROLE_TYPE.IT_ADMIN,
        ROLE_TYPE.SUPER_ADMIN,
        ROLE_TYPE.CALL_CENTER_ADMIN,
        ROLE_TYPE.CALL_CENTER_USER,
    ]

    engine = create_engine(db_url)
    with Session(engine) as db:
        for role_type in _SYSTEM_ROLES:
            exists = (
                db.query(Role)
                .filter(Role.role_type == role_type, Role.department_id == None)  # noqa: E711
                .first()
            )
            if exists:
                print(f"  exists {role_type.value!r}")
            else:
                db.add(Role(role_type=role_type, department_id=None))
                print(f"  create {role_type.value!r}")
        db.commit()


def _seed_users(db_url: str, users: list[dict]) -> None:
    """Insert Role + StaffUser rows, skipping entries whose email already exists."""
    from sqlalchemy.orm import Session
    from database.models import Role, StaffUser
    from constants import ROLE_TYPE

    engine = create_engine(db_url)
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds")

    with Session(engine) as db:
        for entry in users:
            role_type: ROLE_TYPE = entry["role_type"]
            name: str            = entry["name"]
            email: str           = entry["email"]

            if db.query(StaffUser).filter(StaffUser.email == email).first():
                print(f"  skip   {email!r} — already exists")
                continue

            # All seeded accounts have no department (system / call-center roles).
            role = (
                db.query(Role)
                .filter(Role.role_type == role_type, Role.department_id == None)  # noqa: E711
                .first()
            )
            if role is None:
                role = Role(role_type=role_type, department_id=None)
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
            print(f"  seeded {role_type.value!r:22s} {email!r}")


def main():
    parser = argparse.ArgumentParser(description="Initialise database tables.")
    parser.add_argument(
        "--db",
        default="sqlite:///application.db",
        help="SQLAlchemy database URL (default: sqlite:///application.db)",
    )

    parser.add_argument(
        "--seed",
        action="store_true",
        help="Seed initial system accounts (super_admin + it_admin required; call-center optional)",
    )
    # Required system admins
    parser.add_argument("--super-admin-name",  default="Super Admin")
    parser.add_argument("--super-admin-email", default=None)
    parser.add_argument("--it-admin-name",     default="IT Admin")
    parser.add_argument("--it-admin-email",    default=None)
    # Optional call-center accounts
    parser.add_argument("--cc-admin-name",     default="Call Center Admin")
    parser.add_argument("--cc-admin-email",    default=None)
    parser.add_argument("--cc-user-name",      default="Call Center User")
    parser.add_argument("--cc-user-email",     default=None)

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

    # ── roles (always) ────────────────────────────────────────────────────────
    print("\nEnsuring system roles exist...")
    _seed_roles(db_url)

    # ── optional user seeding ──────────────────────────────────────────────────
    if args.seed:
        if not args.super_admin_email or not args.it_admin_email:
            print(
                "\nError: --seed requires --super-admin-email and --it-admin-email.",
                file=sys.stderr,
            )
            sys.exit(1)

        from constants import ROLE_TYPE

        to_seed = [
            {"role_type": ROLE_TYPE.SUPER_ADMIN, "name": args.super_admin_name, "email": args.super_admin_email},
            {"role_type": ROLE_TYPE.IT_ADMIN,    "name": args.it_admin_name,    "email": args.it_admin_email},
        ]
        if args.cc_admin_email:
            to_seed.append({"role_type": ROLE_TYPE.CALL_CENTER_ADMIN, "name": args.cc_admin_name, "email": args.cc_admin_email})
        if args.cc_user_email:
            to_seed.append({"role_type": ROLE_TYPE.CALL_CENTER_USER,  "name": args.cc_user_name,  "email": args.cc_user_email})

        print(f"\nSeeding {len(to_seed)} account(s)...")
        _seed_users(db_url, to_seed)
        print("Seeding complete.")


if __name__ == "__main__":
    main()
