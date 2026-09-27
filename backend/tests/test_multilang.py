"""Multi-language support without Docker: error parsing and Orvi's explanations run on real
runner output captured in fixtures/runner_samples.json; the HTTP runner is faked for the API flow."""
import json
from pathlib import Path

import pytest

from app.services import compilers, explain, runner
from tests.conftest import login

SAMPLES = json.loads((Path(__file__).parent / "fixtures" / "runner_samples.json").read_text())

# sample → (error name contains, line, explanation contains, fix label contains or None)
EXPECT = {
    "python_name": ("NameError", 2, "skor", "skor"),
    "python_colon": ("SyntaxError", 2, "titik dua", "Tambahkan :"),
    "python_indent": ("IndentationError", 2, "menjorok", None),
    "python_concat": ("TypeError", 2, "str(x)", None),
    "python_eof": ("EOFError", 1, "Input", None),
    "js_ref": ("ReferenceError", 2, "skor", "skor"),
    "js_const": ("TypeError", 2, "let", "let a"),
    "php_semicolon": ("Parse error", 3, "titik koma", "baris 2"),
    "php_undef": ("Warning", 3, "$nilai", "$nilai"),
    "php_func": ("Error", 2, "strlen", "strlen"),
    "c_semicolon": ("error", 4, "titik koma", "baris 3"),
    "c_undeclared": ("error", 4, "total", "total"),
    "c_implicit": ("error", 3, "printf", "printf"),
    "c_segv": ("Segmentation fault", None, "memori", None),
    "c_fpe": ("Arithmetic exception", None, "nol", None),
    "cpp_cout": ("error", 3, "std::cout", None),
    "cpp_at": ("std::out_of_range", None, "Indeks", None),
    "rust_mut": ("E0384", 3, "mut", "let mut skor"),
    "rust_move": ("E0382", 4, "dipindahkan", None),
    "rust_missing": ("E0425", 3, "total", "total"),
    "rust_semicolon": ("error", 2, "titik koma", "baris 2"),
    "rust_panic": ("panic", 4, "indeks terakhir", None),
    "go_unused": ("error", 5, "os", "Hapus import os"),
    "go_undefined": ("error", 7, "nilai", "nilai"),
    "go_panic": ("panic", 8, "Indeks terakhir", None),
    "java_semicolon": ("error", 3, "titik koma", "baris 3"),
    "java_symbol": ("error", 4, "total", "total"),
    "java_div": ("ArithmeticException", 4, "nol", None),
    "kotlin_val": ("error", 3, "var", "var skor"),
    "kotlin_unresolved": ("error", 3, "nilai", "nilai"),
    "sql_table": ("SQL error", 2, "siswa", "siswa"),
    "sql_column": ("SQL error", 2, "nama", "nama"),
    "sql_syntax": ("SQL error", 2, "SELECT", "SELECT"),
}


@pytest.mark.parametrize("key", list(EXPECT))
def test_error_is_found_and_explained(key):
    s = SAMPLES[key]
    lang, code, res = s["lang"], s["code"], s["res"]
    err = compilers.primary(lang, res)
    name, line, text, fix = EXPECT[key]
    assert err is not None and name in err["name"], err
    assert err["line"] == line, err
    from app.services.diagnostics import diagnose
    d = diagnose(code, err, "", 6, lang)
    assert d["available"], (key, err)
    assert text.lower() in d["text"].lower(), d["text"]
    if fix:
        assert fix in d["fix"]["label"], d.get("fix")
        assert d["fix"]["code"] != code
    else:
        assert "fix" not in d or d["fix"]


def test_fixes_compile_cleanly():
    """The one-click fixes produce the code a learner would have written."""
    s = SAMPLES["rust_mut"]
    err = compilers.primary("rust", s["res"])
    assert "let mut skor = 0;" in explain.explain("rust", s["code"], err)["fix"]["code"]
    s = SAMPLES["c_semicolon"]
    err = compilers.primary("c", s["res"])
    assert "    int x = 1;\n" in explain.explain("c", s["code"], err)["fix"]["code"]
    s = SAMPLES["go_unused"]
    err = compilers.primary("go", s["res"])
    assert '"os"' not in explain.explain("go", s["code"], err)["fix"]["code"]


def test_compiler_diagnostics_include_warnings():
    diags = compilers.all_diagnostics("c", SAMPLES["c_semicolon"]["res"])
    assert {d["severity"] for d in diags} == {"error", "warning"}
    assert any(d["line"] == 3 and "unused variable" in d["message"] for d in diags)


def test_capped_assist():
    assert explain.explain("python", "x", {"name": "NameError", "message": "name 'y' is not defined"}, 1) == {"available": False, "reason": "capped"}


# ------------------------------------------------------------------ API
def fake_runner(monkeypatch, responder):
    monkeypatch.setattr(runner.settings, "runner_url", "http://runner.test")
    monkeypatch.setattr(runner.settings, "runner_token", "x" * 32)
    calls = []

    def _post(path, body):
        calls.append(body)
        return responder(body)
    monkeypatch.setattr(runner, "_post", _post)
    return calls


def test_run_endpoint_returns_error_and_diagnostics(client, monkeypatch):
    calls = fake_runner(monkeypatch, lambda body: SAMPLES["rust_mut"]["res"])
    login(client, "nadia@smksig.sch.id")
    r = client.post("/api/run", json={"lang": "rust", "code": SAMPLES["rust_mut"]["code"], "stdin": ""})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["ok"] is False and d["error"]["line"] == 3 and d["compile"]["ok"] is False
    assert calls[0]["lang"] == "rust"
    r = client.post("/api/diagnose", json={"code": SAMPLES["rust_mut"]["code"], "error": d["error"], "lang": "rust"})
    assert r.json()["fix"]["label"] == "Ubah jadi let mut skor"


def test_run_endpoint_respects_admin_switch(client, monkeypatch):
    fake_runner(monkeypatch, lambda body: {"lang": "python", "compile": None, "run": {"exit": 0, "stdout": "hai\n", "stderr": ""}, "tests": []})
    login(client, "sekar@smksig.sch.id")
    r = client.put("/api/admin/runtime", json={"disabled": ["python"], "timeout": {"java": 6}, "memory": {}})
    assert r.status_code == 200 and r.json()["disabled"] == ["python"]
    assert client.post("/api/run", json={"lang": "python", "code": "print('hai')"}).status_code == 409
    client.put("/api/admin/runtime", json={"disabled": [], "timeout": {}, "memory": {}})
    r = client.post("/api/run", json={"lang": "python", "code": "print('hai')"})
    assert r.status_code == 200 and r.json()["stdout"] == ["hai"]


def test_runner_down_is_a_clear_503(client, monkeypatch):
    def down(body):
        raise runner.RunnerUnavailable("Runner kode sedang tidak bisa dihubungi. Coba lagi sebentar.")
    fake_runner(monkeypatch, down)
    login(client, "nadia@smksig.sch.id")
    r = client.post("/api/run", json={"lang": "go", "code": "package main"})
    assert r.status_code == 503 and "Runner" in r.json()["detail"]


def test_program_notebook_roundtrip(client):
    login(client, "nadia@smksig.sch.id")
    r = client.post("/api/notebooks", json={"kind": "program", "lang": "cpp"})
    assert r.status_code == 200
    nb = r.json()
    assert nb["kind"] == "program" and nb["lang"] == "cpp" and "#include <iostream>" in nb["files"]["code"]
    r = client.put(f"/api/notebooks/{nb['id']}", json={"files": {"code": "int main(){}", "stdin": "3"}, "lang": "c"})
    assert r.json()["files"] == {"code": "int main(){}", "stdin": "3"} and r.json()["lang"] == "c"
    items = client.get("/api/notebooks").json()["items"]
    assert any(i["id"] == nb["id"] and i["kind"] == "program" for i in items)


def test_io_tests_map_to_robot_results(monkeypatch):
    def responder(body):
        return {"lang": "python", "compile": None, "run": None, "ms": 10, "tests": [
            {"id": "a", "pass": True, "stdout": "7\n", "stderr": "", "exit": 0, "ms": 40},
            {"id": "b", "pass": False, "stdout": "8\n", "stderr": "", "exit": 0, "ms": 41},
            {"id": "c", "pass": False, "stdout": "1\n", "stderr": "", "exit": 0, "ms": 42}]}
    fake_runner(monkeypatch, responder)
    tests = [{"id": "a", "kind": "io", "stdin": "3 4", "expect": "7", "name": "contoh"},
             {"id": "b", "kind": "io", "stdin": "4 4", "expect": "8 ", "name": "b"},
             {"id": "c", "kind": "io", "stdin": "0 0", "expect": "0", "hidden": True, "name": "rahasia"}]
    r = runner.run_tests("python", "print(sum(map(int, input().split())))", tests)
    assert [x["pass"] for x in r["results"]] == [True, False, False]
    assert r["results"][1]["detail"].startswith('diharapkan "8"')
    assert r["results"][2]["detail"] == "tes tersembunyi belum lulus"
    assert r["logs"] == ["7"]


def test_web_project_flow(client, monkeypatch):
    from app.services import preview
    monkeypatch.setattr(runner.settings, "runner_url", "http://runner.test")
    monkeypatch.setattr(runner.settings, "runner_token", "x" * 32)
    monkeypatch.setattr(preview.settings, "preview_secret", "s" * 32)
    calls = []

    def call(method, path, body=None, params=None):
        calls.append((method, path, body))
        if path == "/sessions" or (method == "GET" and path.count("/") == 2):
            return {"state": "running", "stack": "php", "since": 1}
        if path.endswith("/logs"):
            return {"lines": [{"t": 1.0, "text": "PHP Development Server started"}], "cursor": 1.0}
        return {"ok": True}
    monkeypatch.setattr(runner, "call", call)
    login(client, "nadia@smksig.sch.id")
    nb = client.post("/api/notebooks", json={"kind": "web", "stack": "php"}).json()
    assert nb["kind"] == "web" and "public/index.php" in nb["files"]["files"] and nb["files"]["stack"] == "php"
    r = client.post(f"/api/web/{nb['id']}/start").json()
    assert r["status"]["state"] == "running" and "/__orv/enter?t=v1.p" in r["preview"]
    sent = calls[0][2]
    assert sent["sid"] == f"p{nb['id']}" and sent["stack"] == "php" and "db.php" in sent["files"]
    # the token is signed for this project and user
    tok = r["preview"].split("t=")[1].split("&")[0].replace("%2F", "/")
    v, sid, uid, exp, sig = tok.split(".")
    body = f"{v}.{sid}.{uid}.{exp}"
    import hashlib, hmac
    assert sig == hmac.new(b"s" * 32, body.encode(), hashlib.sha256).hexdigest()[:40] and sid == f"p{nb['id']}"
    r = client.put(f"/api/web/{nb['id']}/files", json={"write": {"public/about.php": "<?php echo 1;"}, "running": True}).json()
    assert r["synced"] and r["count"] == 4
    assert client.put(f"/api/web/{nb['id']}/files", json={"write": {"../x": "1"}}).status_code == 400
    st = client.get(f"/api/web/{nb['id']}/status").json()
    assert st["logs"]["lines"][0]["text"].startswith("PHP")
    # someone else cannot touch it
    login(client, "dimas@smksig.sch.id")
    assert client.post(f"/api/web/{nb['id']}/start").status_code == 404
    login(client, "nadia@smksig.sch.id")
    assert client.delete(f"/api/notebooks/{nb['id']}").status_code == 200
    assert ("DELETE", f"/projects/p{nb['id']}", None) in calls
