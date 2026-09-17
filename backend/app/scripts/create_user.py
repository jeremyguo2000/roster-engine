"""
CLI script to create a new user. Used to bootstrap the first user
since POST /api/auth/users requires an existing user to be logged in.

Usage:
    docker compose -f docker-compose.dev.yml exec backend \\
        python -m app.scripts.create_user <username> <password> [--update]

With --update an existing user gets the given password instead of an error,
so deployment bootstraps can run it on every start.
"""
import sys

from app.database import SessionLocal
from app.dependencies.auth import hash_password
from app.models import User


def main():
    args = sys.argv[1:]
    update = "--update" in args
    args = [a for a in args if a != "--update"]
    if len(args) != 2:
        print("Usage: python -m app.scripts.create_user <username> <password> [--update]")
        sys.exit(1)

    username, password = args

    if len(username) < 3:
        print("Error: username must be at least 3 characters.")
        sys.exit(1)
    if len(password) < 6:
        print("Error: password must be at least 6 characters.")
        sys.exit(1)

    db = SessionLocal()
    try:
        existing = db.query(User).filter_by(username=username).first()
        if existing:
            if not update:
                print(f"Error: user '{username}' already exists.")
                sys.exit(1)
            existing.password_hash = hash_password(password)
            db.commit()
            print(f"✅ Updated password for user '{username}' (id={existing.id})")
            return

        user = User(
            username=username,
            password_hash=hash_password(password),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        print(f"✅ Created user '{username}' (id={user.id})")
    finally:
        db.close()


if __name__ == "__main__":
    main()
