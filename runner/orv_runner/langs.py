"""Languages the runner knows: which sandbox image, how to compile, how to run.

Commands run with /box (the job's files) as the working directory. Compiled
output goes to /box/out, the only directory the sandbox user may write during
compilation.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

JVM_RUN = ("java", "-Xmx160m", "-Xss8m", "-XX:+UseSerialGC", "-XX:TieredStopAtLevel=1", "-Xshare:auto", "-XX:-UsePerfData")


@dataclass(frozen=True)
class Lang:
    id: str
    name: str
    image: str
    file: str
    run: tuple[str, ...]
    compile: tuple[str, ...] | None = None
    run_mem: int = 256
    compile_mem: int = 512
    run_timeout: float = 3.0
    compile_timeout: float = 20.0
    pids: int = 128
    env: dict[str, str] = field(default_factory=dict)
    version: tuple[str, ...] = ()


LANGS: dict[str, Lang] = {l.id: l for l in [
    Lang("python", "Python", "py", "main.py", ("python3", "-u", "main.py"),
         version=("python3", "--version")),
    Lang("javascript", "JavaScript", "node", "main.js", ("node", "--max-old-space-size=128", "--stack-size=4000", "main.js"),
         version=("node", "--version")),
    Lang("php", "PHP", "php", "main.php", ("php", "-d", "display_errors=stderr", "-d", "log_errors=0", "-d", "memory_limit=128M", "main.php"),
         version=("php", "-r", "echo 'PHP ', PHP_VERSION;")),
    Lang("c", "C", "c", "main.c", ("./out/main",), compile=("gcc", "-std=c17", "-O1", "-Wall", "-o", "out/main", "main.c", "-lm"),
         version=("sh", "-c", "gcc --version | head -n1")),
    Lang("cpp", "C++", "c", "main.cpp", ("./out/main",), compile=("g++", "-std=c++20", "-O1", "-Wall", "-o", "out/main", "main.cpp"),
         version=("sh", "-c", "g++ --version | head -n1")),
    Lang("rust", "Rust", "rust", "main.rs", ("./out/main",),
         compile=("rustc", "--edition", "2021", "-C", "debuginfo=0", "-C", "codegen-units=4", "-o", "out/main", "main.rs"),
         version=("rustc", "--version")),
    Lang("go", "Go", "go", "main.go", ("./out/main",), compile=("go", "build", "-o", "out/main", "main.go"),
         version=("go", "version")),
    Lang("java", "Java", "jvm", "Main.java", JVM_RUN + ("-cp", "out", "Main"),
         compile=("javac", "-encoding", "UTF-8", "-J-Xmx256m", "-J-XX:+UseSerialGC", "-J-XX:TieredStopAtLevel=1", "-d", "out", "Main.java"),
         run_mem=384, compile_mem=640, run_timeout=5.0, pids=256, version=("sh", "-c", "java -version 2>&1 | head -n1")),
    Lang("kotlin", "Kotlin", "jvm", "main.kt", JVM_RUN + ("-cp", "out:/opt/kotlinc/lib/kotlin-stdlib.jar", "MainKt"),
         compile=("kotlinc", "main.kt", "-d", "out", "-nowarn"),
         run_mem=384, compile_mem=900, run_timeout=5.0, compile_timeout=45.0, pids=256,
         env={"JAVA_OPTS": "-Xmx600m -XX:+UseSerialGC -XX:TieredStopAtLevel=1"},
         version=("sh", "-c", "kotlinc -version 2>&1 | tail -n1")),
    Lang("sql", "SQL", "py", "main.sql", ("python3", "/box/.orv/sqlrun.py", "main.sql"),
         version=("python3", "-c", "import sqlite3; print('SQLite', sqlite3.sqlite_version)")),
    # the legacy JavaScript test harness (node:vm, tests evaluated inside the program's context)
    Lang("js-harness", "JavaScript (tes lama)", "node", "job.json",
         ("node", "--max-old-space-size=64", "--disallow-code-generation-from-strings", "/box/.orv/sandbox.mjs"), run_timeout=8.0),
]}

PUBLIC_LANGS = [l for l in LANGS.values() if l.id != "js-harness"]

_JAVA_PUBLIC = re.compile(r"\bpublic\s+(?:(?:final|abstract|sealed|strictfp)\s+)*(?:class|record|enum|interface)\s+([A-Za-z_]\w*)")
_JAVA_TYPE = re.compile(r"\b(?:class|record|enum|interface)\s+([A-Za-z_]\w*)")
_JAVA_MAIN = re.compile(r"\bstatic\s+void\s+main\s*\(")
_JAVA_PACKAGE = re.compile(r"^[ \t]*package[ \t]+[\w.]+[ \t]*;", re.M)


def java_names(code: str) -> tuple[str, str]:
    """(source file name, class to run). Java wants the public class in a file of the same name,
    and the class with `main` is the one to start."""
    m = _JAVA_PUBLIC.search(code)
    filename = f"{m.group(1)}.java" if m else "Main.java"
    main_at = _JAVA_MAIN.search(code)
    main_cls = "Main"
    if main_at:
        before = [t for t in _JAVA_TYPE.finditer(code) if t.start() < main_at.start()]
        if before:
            main_cls = before[-1].group(1)
    elif m:
        main_cls = m.group(1)
    return filename, main_cls


def plan(lang: Lang, code: str) -> tuple[str, str, tuple[str, ...] | None, tuple[str, ...]]:
    """(source to write, file name, compile command, run command) for this program."""
    if lang.id != "java":
        return code, lang.file, lang.compile, lang.run
    code = _JAVA_PACKAGE.sub("", code)  # a package line would move the class into a folder; line numbers stay the same
    filename, main_cls = java_names(code)
    compile_cmd = tuple(filename if a == "Main.java" else a for a in lang.compile or ())
    run_cmd = lang.run[:-1] + (main_cls,)
    return code, filename, compile_cmd, run_cmd
