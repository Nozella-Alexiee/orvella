"""Workspace sessions (needs docker + sandbox images; runs inside the runner container)."""
import time

import pytest

from orv_runner import workspace
from orv_runner.sandbox import client

SID = "p999999901"
PROBE = ("import socket, sys\n"
         "def can(host, port):\n"
         "    try:\n        socket.create_connection((host, port), timeout=2); return 'TERBUKA'\n"
         "    except OSError:\n        return 'tertutup'\n"
         "print(can('1.1.1.1', 80), can('db', 5432), can('app', 8000), can('runner', 8080), can('mysql', 3306))\n")


@pytest.fixture()
def session():
    workspace.start(SID, 42, "static", {"index.html": "<h1>halo</h1>", "probe.py": PROBE})
    yield client().containers.get(f"orv-ws-{SID}")
    workspace.stop(SID)


def test_container_is_locked_down(session):
    hc = session.attrs["HostConfig"]
    assert hc["ReadonlyRootfs"] and hc["CapDrop"] == ["ALL"] and "no-new-privileges" in hc["SecurityOpt"][0]
    assert hc["Memory"] == 384 * 1024 * 1024 and hc["PidsLimit"] == 128
    assert session.attrs["Config"]["User"] == "10001:10001"
    assert session.labels["orvella.sandbox"] == "1" and session.labels["orvella.owner"] == "42"
    nets = session.attrs["NetworkSettings"]["Networks"]
    assert list(nets) == [f"orv-ws-{SID}"]
    net = client().networks.get(f"orv-ws-{SID}")
    assert net.attrs["Internal"] is True


def test_no_internet_and_no_other_services(session):
    time.sleep(0.5)
    code, out = session.exec_run(["python3", "/app/probe.py"], user="10001:10001")
    assert out.decode().split() == ["tertutup"] * 5, out


def test_stop_cleans_container_and_network():
    workspace.start(SID, 42, "static", {"index.html": "x"})
    workspace.stop(SID)
    names = [c.name for c in client().containers.list(all=True)]
    assert f"orv-ws-{SID}" not in names
    assert not client().networks.list(names=[f"orv-ws-{SID}"])


def test_bad_paths_are_rejected():
    with pytest.raises(ValueError):
        workspace.write_files(SID, {"../escape.txt": "x"})
    with pytest.raises(ValueError):
        workspace.write_files(SID, {"/etc/passwd": "x"})


def test_one_session_per_owner():
    workspace.start("p999999902", 77, "static", {"index.html": "a"})
    workspace.start("p999999903", 77, "static", {"index.html": "b"})
    try:
        assert "p999999902" not in workspace.SESSIONS and "p999999903" in workspace.SESSIONS
    finally:
        workspace.stop("p999999902")
        workspace.stop("p999999903")
