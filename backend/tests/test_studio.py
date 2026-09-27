"""Studio Materi, multi-language paths and who may see or edit them."""
import pytest
from sqlalchemy import select

from app.models import Klass, Path, User
from app.routers.admin import validate
from app.routers.studio import youtube_id
from app.security import hash_password
from app.seed import multilang
from tests.conftest import PASSWORD, login


@pytest.mark.parametrize("key", list(multilang.ALL_CONTENT))
def test_starter_content_is_publishable(key):
    c = multilang.ALL_CONTENT[key]
    assert validate(c) == [], key
    ch = c.get("challenge")
    if ch:  # every challenge has a reference solution and io tests with at least one visible example
        assert ch["solution"] and all(t["kind"] == "io" for t in ch["tests"]) and any(not t["hidden"] for t in ch["tests"])
    for it in c["perkuat"]["items"]:
        if it["type"] in ("code", "translate"):
            assert it["solution"] and it["tests"]


def test_catalog_shows_public_and_class_paths(client):
    login(client, "nadia@smksig.sch.id")
    d = client.get("/api/paths").json()
    langs = {i["slug"]: i["language"] for i in d["items"]}
    assert {"js-dasar": "javascript", "python-dasar": "python", "cpp-dasar": "cpp", "rust-dasar": "rust", "web-dasar": "html"}.items() <= langs.items()
    mine = next(i for i in d["items"] if i["slug"] == "latihan-python-xii-rpl")
    assert mine["from_class"] and mine["by"].startswith("Dimas") and d["current"] == "js-dasar"
    # picking a path makes Beranda and /peta follow it
    assert client.post("/api/paths/python-dasar/pick").status_code == 200
    m = client.get("/api/paths/saya/map").json()
    assert m["path"]["slug"] == "python-dasar" and m["path"]["language"] == "python" and len(m["nodes"]) == 2
    client.post("/api/paths/js-dasar/pick")


def test_class_path_is_hidden_from_other_classes(client, db):
    xi = db.scalar(select(Klass).where(Klass.name == "XI RPL 1"))
    if not db.scalar(select(User).where(User.email == "tamu@smksig.sch.id")):
        db.add(User(email="tamu@smksig.sch.id", name="Tamu", password_hash=hash_password(PASSWORD), role="learner", class_id=xi.id, onboarded=True, prefs={}))
        db.commit()
    login(client, "tamu@smksig.sch.id")
    slugs = {i["slug"] for i in client.get("/api/paths").json()["items"]}
    assert "python-dasar" in slugs and "latihan-python-xii-rpl" not in slugs
    assert client.get("/api/paths/latihan-python-xii-rpl/map").status_code == 404
    p = db.scalar(select(Path).where(Path.slug == "latihan-python-xii-rpl"))
    from app.models import Chapter
    ch = db.scalar(select(Chapter).where(Chapter.path_id == p.id))
    assert client.get(f"/api/chapters/{ch.id}").status_code == 404
    assert client.get(f"/api/chapters/{ch.id}/pahami").status_code == 404


def test_mentor_builds_and_publishes_a_path(client, db):
    login(client, "dimas@smksig.sch.id")
    ov = client.get("/api/studio/overview").json()
    assert [p["slug"] for p in ov["paths"]] == ["latihan-python-xii-rpl"] and ov["classes"]
    p = client.post("/api/studio/paths", json={"title": "Go untuk Robotik", "language": "go", "level": "Menengah"}).json()
    assert p["visibility"] == "draft" and p["language"] == "go"
    cid = client.post(f"/api/studio/paths/{p['id']}/chapters", json={"title": "Halo, Go"}).json()["id"]
    ch = client.get(f"/api/admin/chapters/{cid}").json()
    assert ch["can_edit"] and ch["language"] == "go" and ch["problems"]
    draft = ch["draft"]
    draft["pahami"]["scenes"] = [{"id": "s1", "kicker": "", "title": "Halo", "visual": {"type": "markdown", "md": "**Go** itu cepat."}}]
    draft["perkuat"]["items"] = [{"id": "q1", "type": "choice", "title": "Kata kunci fungsi di Go?", "choices": ["func", "def"], "answer": 0}]
    draft["kuis"]["round_size"] = 2
    draft["kuis"]["bank"] = [{"id": f"k{i}", "t": f"Soal {i}", "o": ["a", "b"], "a": 0} for i in range(2)]
    draft["challenge"] = {"title": "Halo", "language": "go", "tests": [{"id": "t1", "kind": "io", "stdin": "", "expect": "Halo"}], "steps": [], "starter": "", "story": ""}
    r = client.put(f"/api/admin/chapters/{cid}/draft", json={"draft": draft}).json()
    assert r["problems"] == []
    assert client.post(f"/api/admin/chapters/{cid}/publish").json()["version"] == 1
    # mentors publish to their own classes, never to the public catalog
    assert client.patch(f"/api/studio/paths/{p['id']}", json={"visibility": "public"}).status_code == 403
    assert client.patch(f"/api/studio/paths/{p['id']}", json={"class_ids": [99999]}).status_code == 403
    klass = next(k["id"] for k in ov["classes"] if k["name"] == "XII RPL")
    r = client.patch(f"/api/studio/paths/{p['id']}", json={"visibility": "class", "class_ids": [klass]})
    assert r.status_code == 200 and r.json()["visibility"] == "class"
    # ...and cannot touch someone else's path
    js = db.scalar(select(Path).where(Path.slug == "js-dasar"))
    assert client.patch(f"/api/studio/paths/{js.id}", json={"title": "x"}).status_code == 403
    from app.models import Chapter
    js_ch = db.scalar(select(Chapter).where(Chapter.path_id == js.id, Chapter.kind == "chapter"))
    assert client.put(f"/api/admin/chapters/{js_ch.id}/draft", json={"draft": {}}).status_code == 403
    # copy a public chapter into the mentor's own path (e.g. to adapt it)
    py = db.scalar(select(Path).where(Path.slug == "python-dasar"))
    py_ch = db.scalar(select(Chapter).where(Chapter.path_id == py.id))
    r = client.post(f"/api/studio/chapters/{py_ch.id}/copy", json={"path_id": p["id"]})
    assert r.status_code == 200
    copied = client.get(f"/api/admin/chapters/{r.json()['id']}").json()
    assert copied["language"] == "go" and copied["version"] == 0
    # the learner in that class now sees it
    login(client, "nadia@smksig.sch.id")
    assert any(i["slug"] == p["slug"] for i in client.get("/api/paths").json()["items"])


def test_quick_quiz_endpoint(client):
    login(client, "dimas@smksig.sch.id")
    r = client.post("/api/studio/quiz/parse", json={"text": "Apa itu 2**3?\n- 6\n* 8\n\nTanpa kunci\n- a\n- b"}).json()
    assert r["questions"] == [{"t": "Apa itu 2**3?", "o": ["6", "8"], "a": 1, "e": ""}] and len(r["warnings"]) == 1
    login(client, "nadia@smksig.sch.id")
    assert client.post("/api/studio/quiz/parse", json={"text": "x"}).status_code == 403


@pytest.mark.parametrize("url,vid,start", [
    ("https://www.youtube.com/watch?v=x7X9w_GIm1s", "x7X9w_GIm1s", 0),
    ("https://youtu.be/x7X9w_GIm1s?t=42", "x7X9w_GIm1s", 42),
    ("youtube.com/shorts/x7X9w_GIm1s", "x7X9w_GIm1s", 0),
    ("https://www.youtube.com/watch?v=x7X9w_GIm1s&t=1m30s", "x7X9w_GIm1s", 90),
    ("https://m.youtube.com/embed/x7X9w_GIm1s", "x7X9w_GIm1s", 0),
    ("https://vimeo.com/123", None, 0),
    ("https://www.youtube.com/watch?v=bad", None, 0),
])
def test_youtube_links(url, vid, start):
    assert youtube_id(url) == (vid, start)
