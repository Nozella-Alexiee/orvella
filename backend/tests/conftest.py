import os
import sys
import tempfile
from pathlib import Path

import pytest

# A throwaway database per test session, seeded with the demo curriculum and class.
# Set ORVELLA_TEST_DATABASE_URL to run the suite against PostgreSQL (the database is reset!).
_tmp = Path(tempfile.mkdtemp(prefix="orvella-test-"))
os.environ["ORVELLA_DATABASE_URL"] = os.environ.get("ORVELLA_TEST_DATABASE_URL") or f"sqlite:///{(_tmp / 'test.db').as_posix()}"
# Code runs with the local Node fallback unless a test opts into the runner, whatever backend/.env says for development.
os.environ["ORVELLA_RUNNER_URL"] = os.environ.get("ORVELLA_TEST_RUNNER_URL", "")
# Same for the public URL: backend/.env may point Google sign-in at the dev server; tests expect the test client's host.
os.environ["ORVELLA_PUBLIC_URL"] = ""
for _k in ("GROQ", "CEREBRAS", "GEMINI"):  # tes tidak pernah memanggil layanan AI sungguhan
    os.environ[f"ORVELLA_{_k}_API_KEY"] = ""
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.seed.seed import run as seed_run  # noqa: E402

seed_run(reset=True)

PASSWORD = "orvella123"


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)


def login(c: TestClient, email: str) -> None:
    r = c.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text


@pytest.fixture()
def db():
    from app.db import SessionLocal
    s = SessionLocal()
    yield s
    s.close()
