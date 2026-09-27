"""Steps through a Python program line by line and records what memory looks like
(frames with their variables, and the objects they point to), for Orvella's
memory animation. Runs inside the py sandbox; prints one JSON document.

Step: {line, event, frames: [{name, vars: [{name, v | ref}]}], heap: [{id, type, items | label}], out}
Numbers, strings, booleans and None are shown inside the variable box; lists,
dicts, tuples, sets, objects and functions are drawn as objects with arrows.
"""
import io
import json
import sys
import types

FILE = "main.py"
MAX_STEPS = 160
MAX_ITEMS = 10

src = open(sys.argv[1], encoding="utf-8").read()
real_out = sys.stdout
buf = io.StringIO()
steps = []
names = {}  # id(obj) -> "o1", stable across steps


def short(v):
    r = repr(v)
    return r if len(r) <= 48 else r[:45] + "..."


def oid(v):
    k = id(v)
    if k not in names:
        names[k] = f"o{len(names) + 1}"
    return names[k]


def enc(v, heap, depth=0):
    if v is None or isinstance(v, (bool, int, float, complex, str, bytes)):
        return {"v": short(v)}
    ref = oid(v)
    if ref in heap or depth > 3:
        return {"ref": ref}
    heap[ref] = {"id": ref, "type": type(v).__name__}
    if isinstance(v, (list, tuple, set, frozenset)):
        items = list(v)
        heap[ref]["items"] = [enc(x, heap, depth + 1) for x in items[:MAX_ITEMS]]
        if len(items) > MAX_ITEMS:
            heap[ref]["more"] = len(items) - MAX_ITEMS
    elif isinstance(v, dict):
        items = list(v.items())
        heap[ref]["items"] = [{"k": short(k), **enc(x, heap, depth + 1)} for k, x in items[:MAX_ITEMS]]
        if len(items) > MAX_ITEMS:
            heap[ref]["more"] = len(items) - MAX_ITEMS
    elif isinstance(v, (types.FunctionType, types.BuiltinFunctionType)):
        heap[ref]["label"] = f"{v.__name__}()"
        heap[ref]["type"] = "fungsi"
    elif isinstance(v, type):
        heap[ref]["label"] = f"class {v.__name__}"
        heap[ref]["type"] = "class"
    elif hasattr(v, "__dict__"):
        heap[ref]["items"] = [{"k": k, **enc(x, heap, depth + 1)} for k, x in list(vars(v).items())[:MAX_ITEMS]]
    else:
        heap[ref]["label"] = short(v)
    return {"ref": ref}


def snap(frame, event, extra=None):
    chain = []
    f = frame
    while f is not None:
        if f.f_code.co_filename == FILE:
            chain.append(f)
        f = f.f_back
    heap = {}
    frames = []
    for fr in reversed(chain):
        top = fr.f_code.co_name == "<module>"
        vs = [{"name": k, **enc(v, heap)} for k, v in list(fr.f_locals.items())
              if not k.startswith("__") and not isinstance(v, types.ModuleType)]
        frames.append({"name": "global" if top else f"{fr.f_code.co_name}()", "vars": vs})
    step = {"line": frame.f_lineno, "event": event, "frames": frames, "heap": list(heap.values()), "out": buf.getvalue()[-1500:]}
    if extra:
        step.update(extra)
    steps.append(step)


class Stop(Exception):
    pass


def tracer(frame, event, arg):
    if frame.f_code.co_filename != FILE:
        return None
    if event == "line":
        snap(frame, "line")
    elif event == "return":
        snap(frame, "return", {"ret": short(arg)})
    if len(steps) >= MAX_STEPS:
        raise Stop()
    return tracer


error = None
truncated = False
try:
    code = compile(src, FILE, "exec")
    sys.stdout = buf
    sys.settrace(tracer)
    try:
        exec(code, {"__name__": "__main__", "__file__": FILE})
    finally:
        sys.settrace(None)
        sys.stdout = real_out
except Stop:
    truncated = True
except SyntaxError as e:
    error = {"name": "SyntaxError", "message": e.msg, "line": e.lineno}
except BaseException as e:  # noqa: BLE001 - the learner's own error is part of the animation
    tb = e.__traceback__
    line = None
    while tb is not None:
        if tb.tb_frame.f_code.co_filename == FILE:
            line = tb.tb_lineno
        tb = tb.tb_next
    error = {"name": type(e).__name__, "message": str(e), "line": line}
sys.stdout = real_out
real_out.write(json.dumps({"steps": steps, "error": error, "truncated": truncated, "out": buf.getvalue()[-4000:]}))
