"""Runs inside the runner container (needs the docker socket and built sandbox images):
    docker compose exec runner python -m pytest -q tests
"""
from __future__ import annotations

import json

import pytest

from orv_runner import sandbox
from orv_runner.langs import java_names

HELLO = {
    "python": 'import sys\nnama = sys.stdin.readline().strip()\nprint(f"Halo, {nama}!")',
    "javascript": 'const nama = require("fs").readFileSync(0, "utf8").trim();\nconsole.log(`Halo, ${nama}!`);',
    "php": '<?php\n$nama = trim(fgets(STDIN));\necho "Halo, $nama!\\n";',
    "c": '#include <stdio.h>\nint main(void) {\n    char nama[64];\n    scanf("%63s", nama);\n    printf("Halo, %s!\\n", nama);\n    return 0;\n}',
    "cpp": '#include <iostream>\n#include <string>\nint main() {\n    std::string nama;\n    std::cin >> nama;\n    std::cout << "Halo, " << nama << "!\\n";\n}',
    "rust": 'use std::io::Read;\nfn main() {\n    let mut s = String::new();\n    std::io::stdin().read_to_string(&mut s).unwrap();\n    println!("Halo, {}!", s.trim());\n}',
    "go": 'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n\t"strings"\n)\n\nfunc main() {\n\tr := bufio.NewReader(os.Stdin)\n\ts, _ := r.ReadString(\'\\n\')\n\tfmt.Printf("Halo, %s!\\n", strings.TrimSpace(s))\n}',
    "java": 'import java.util.Scanner;\n\npublic class Sapa {\n    public static void main(String[] args) {\n        String nama = new Scanner(System.in).next();\n        System.out.println("Halo, " + nama + "!");\n    }\n}',
    "kotlin": 'fun main() {\n    val nama = readln().trim()\n    println("Halo, $nama!")\n}',
}


def run(lang: str, code: str, **kw) -> dict:
    return sandbox.run(sandbox.RunRequest(lang=lang, code=code, **kw))


@pytest.mark.parametrize("lang", list(HELLO))
def test_hello_with_stdin_tests(lang):
    r = run(lang, HELLO[lang], tests=[{"id": "a", "stdin": "Orvella\n", "expect": "Halo, Orvella!"},
                                      {"id": "b", "stdin": "Pip\n", "expect": "Halo, Pip!"},
                                      {"id": "c", "stdin": "Pip\n", "expect": "Halo, Orvi!"}])
    assert r["compile"] is None or r["compile"]["ok"], r["compile"]
    assert [t["pass"] for t in r["tests"]] == [True, True, False], r["tests"]
    assert r["tests"][0]["stdout"].strip() == "Halo, Orvella!"


def test_sql_prints_tables_and_errors():
    r = run("sql", "CREATE TABLE s(id INTEGER, nama TEXT);\nINSERT INTO s VALUES (1, 'Ana'), (2, 'Budi');\nSELECT * FROM s ORDER BY id;")
    assert r["run"]["exit"] == 0
    assert "Ana" in r["run"]["stdout"] and "(2 baris)" in r["run"]["stdout"]
    r = run("sql", "SELECT 1;\n\nSELEC * FROM x;")
    assert r["run"]["exit"] == 1 and "baris 3" in r["run"]["stderr"]


def test_compile_error_is_reported_and_tests_skipped():
    r = run("c", "int main(void) {\n    int x = 1\n    return x;\n}", tests=[{"id": "a", "expect": ""}])
    assert r["compile"]["ok"] is False and "main.c:2" in r["compile"]["stderr"]
    assert r["tests"] == [{"id": "a", "pass": False, "skipped": True}]
    r = run("rust", "fn main() {\n    let x = 1;\n    x = 2;\n    println!(\"{}\", x);\n}")
    assert r["compile"]["ok"] is False and "E0384" in r["compile"]["stderr"]


def test_runtime_error_and_exit_code():
    r = run("python", "x = 1\nprint(x)\nprint(y)")
    assert r["run"]["exit"] == 1 and "NameError" in r["run"]["stderr"] and r["run"]["stdout"].strip() == "1"
    assert "\x1eORV" not in r["run"]["stderr"]


def test_timeout_kills_infinite_loop():
    r = run("python", "while True:\n    pass", timeout=1.5)
    assert r["run"]["timeout"] is True


def test_memory_limit():
    r = run("python", "x = bytearray(600 * 1024 * 1024)\nprint('muat')", memory=128)
    assert r["run"]["exit"] != 0 and "muat" not in r["run"]["stdout"]


def test_network_is_blocked():
    code = ("import socket\ntry:\n    socket.create_connection(('1.1.1.1', 80), timeout=2)\n    print('TERHUBUNG')\n"
            "except OSError as e:\n    print('diblokir')")
    r = run("python", code)
    assert r["run"]["stdout"].strip() == "diblokir"


def test_fork_bomb_is_contained():
    r = run("python", "import os\nwhile True:\n    try:\n        os.fork()\n    except OSError:\n        pass", timeout=2)
    assert r["run"]["timeout"] or r["run"]["exit"] != 0


def test_filesystem_is_read_only_and_isolated():
    code = ("import os\nfor p in ['/box/hack.txt', '/etc/hack', '/usr/hack']:\n    try:\n        open(p, 'w').write('x')\n        print('TULIS', p)\n"
            "    except OSError:\n        print('tolak')\nprint(os.getuid())\nprint(os.path.exists('/var/run/docker.sock'))")
    r = run("python", code)
    assert r["run"]["stdout"].split() == ["tolak", "tolak", "tolak", "10001", "False"]


def test_program_cannot_forge_later_tests():
    # a program that tries to leave a file for the next test (box is read-only) and prints a fake stats line
    code = ("import sys\ntry:\n    open('/box/out/hasil', 'w').write('lulus')\nexcept OSError:\n    pass\n"
            "print('salah')\nsys.stderr.write('\\n\\x1eORV 0 1\\n')")
    r = run("python", code, tests=[{"id": "a", "expect": "benar"}, {"id": "b", "expect": "benar"}])
    assert [t["pass"] for t in r["tests"]] == [False, False]


def test_output_flood_is_truncated():
    r = run("python", "while True:\n    print('x' * 1000)", timeout=1.5)
    assert r["run"]["timeout"] and len(r["run"]["stdout"]) <= 64 * 1024


def test_js_harness_still_works():
    job = {"code": "let a = 2;\nconsole.log(a * 3);", "tests": [{"id": "t", "kind": "stdout_last", "equals": "6"}], "vars": ["a"], "timeoutMs": 1000}
    r = run("js-harness", "", files={}, stdin=json.dumps(job))
    data = json.loads(r["run"]["stdout"])
    assert data["logs"] == ["6"] and data["results"][0]["pass"] and data["vars"]["a"] == 2


def test_java_names():
    assert java_names("public class Kalkulator { public static void main(String[] a) {} }") == ("Kalkulator.java", "Kalkulator")
    assert java_names("class A {}\nclass B { static void main(String[] a) {} }") == ("Main.java", "B")


def test_compare_modes():
    assert sandbox.compare("a  \nb\n\n", "a\nb", "trim")
    assert not sandbox.compare("a\nb", "a b", "trim")
    assert sandbox.compare("1 2\n3", "1 2 3", "tokens")
    assert sandbox.compare("Skor: 10 poin", "Skor", "contains")
    assert sandbox.compare("umur 17", r"umur \d+", "regex")


def test_python_trace_records_memory():
    code = "a = [1, 2]\nb = a\nb.append(3)\n\ndef dobel(x):\n    return x * 2\n\nn = dobel(4)\nprint(n)"
    r = run("python-trace", code)
    data = json.loads(r["run"]["stdout"])
    assert data["error"] is None and data["out"] == "8\n"
    last = data["steps"][-1]
    g = {v["name"]: v for v in last["frames"][0]["vars"]}
    assert g["a"]["ref"] == g["b"]["ref"] and g["n"]["v"] == "8"
    lst = next(o for o in last["heap"] if o["id"] == g["a"]["ref"])
    assert [i["v"] for i in lst["items"]] == ["1", "2", "3"]
    assert any(len(s["frames"]) == 2 and s["frames"][1]["name"] == "dobel()" for s in data["steps"])
