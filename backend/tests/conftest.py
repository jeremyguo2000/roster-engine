# env vars must be set before any app import
import os
from pathlib import Path
from dotenv import dotenv_values

_env = dotenv_values(Path(__file__).parent.parent.parent / ".env")

def _build_dev_url(env):
    """Construct the dev DATABASE_URL from individual POSTGRES_* vars if needed."""
    if env.get("DATABASE_URL"):
        return env["DATABASE_URL"]
    user = env.get("POSTGRES_USER", "roster")
    pw   = env.get("POSTGRES_PASSWORD", "")
    db   = env.get("POSTGRES_DB", "roster_engine")
    return f"postgresql+psycopg://{user}:{pw}@localhost/{db}"

_dev_url = _build_dev_url(_env)
os.environ["DATABASE_URL"] = _dev_url.rsplit("/", 1)[0] + "/roster_engine_test"
os.environ.setdefault("SECRET_KEY", _env.get("SECRET_KEY") or "test-secret-key-not-for-production")
os.environ.setdefault("REDIS_URL", _env.get("REDIS_URL") or "redis://localhost:6379/0")
os.environ.setdefault("CELERY_BROKER_URL", _env.get("CELERY_BROKER_URL") or "redis://localhost:6379/0")
os.environ.setdefault("CELERY_RESULT_BACKEND", _env.get("CELERY_RESULT_BACKEND") or "redis://localhost:6379/0")

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from fastapi.testclient import TestClient

from app.main import app
from app.database import get_db
from app.models import Base, User
from app.dependencies.auth import hash_password, create_access_token


@pytest.fixture(scope="session")
def engine():
    e = create_engine(os.environ["DATABASE_URL"])
    Base.metadata.create_all(e)
    yield e
    Base.metadata.drop_all(e)


@pytest.fixture()
def db(engine):
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture()
def client(db):
    def override():
        yield db
    app.dependency_overrides[get_db] = override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def auth(db, client):
    user = User(username="testuser", password_hash=hash_password("testpass"))
    db.add(user)
    db.flush()
    token = create_access_token(user.id)
    return {
        "headers": {"Authorization": f"Bearer {token}"},
        "user_id": user.id,
        "username": "testuser",
        "password": "testpass",
    }
