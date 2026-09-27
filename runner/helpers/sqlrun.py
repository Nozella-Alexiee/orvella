"""Runs a .sql file against a fresh in-memory SQLite database and prints every
SELECT result as a table. Errors go to stderr as "Error di baris N: pesan".
Runs inside the py sandbox image (copied to /box/.orv/ for each job)."""
import sqlite3
import sys


def fmt(v):
    if v is None:
        return "NULL"
    if isinstance(v, float) and v.is_integer():
        return f"{v:.1f}"
    if isinstance(v, bytes):
        return v.hex()
    return str(v)


def table(cols, rows):
    cells = [[fmt(v) for v in r] for r in rows]
    width = [max([len(c)] + [len(r[i]) for r in cells]) for i, c in enumerate(cols)]
    numeric = [bool(rows) and all(isinstance(r[i], (int, float)) or r[i] is None for r in rows) for i in range(len(cols))]
    print(" " + " | ".join(c.center(width[i]) for i, c in enumerate(cols)))
    print("-" + "-+-".join("-" * w for w in width) + "-")
    for r in cells:
        print(" " + " | ".join(v.rjust(width[i]) if numeric[i] else v.ljust(width[i]) for i, v in enumerate(r)).rstrip())
    print(f"({len(rows)} baris)")


def main():
    src = open(sys.argv[1], encoding="utf-8").read()
    con = sqlite3.connect(":memory:")
    con.execute("PRAGMA foreign_keys = ON")
    buf, start, first = "", 1, True
    printed = False

    def run(stmt, line):
        nonlocal printed
        try:
            cur = con.execute(stmt)
        except sqlite3.Error as e:
            sys.stdout.flush()
            print(f"Error di baris {line}: {e}", file=sys.stderr)
            sys.exit(1)
        if cur.description:
            cols = [d[0] for d in cur.description]
            rows = cur.fetchmany(500)
            if printed:
                print()
            table(cols, rows)
            printed = True
        con.commit()

    for n, line in enumerate(src.splitlines(keepends=True), 1):
        if first and line.strip() and not line.strip().startswith("--"):
            start, first = n, False
        buf += line
        if not first and sqlite3.complete_statement(buf):
            run(buf, start)
            buf, first = "", True
    if buf.strip() and not all(l.strip().startswith("--") or not l.strip() for l in buf.splitlines()):
        run(buf, start)


if __name__ == "__main__":
    main()
