import json
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from bridge import Bridge  # noqa: E402


def make_dir(tmp_path, with_python=True):
    scripts = tmp_path / ".venv" / "Scripts"
    scripts.mkdir(parents=True)
    if with_python:
        (scripts / "python.exe").write_text("")
        (scripts / "pythonw.exe").write_text("")
    return tmp_path


def result(stdout="", stderr=""):
    return SimpleNamespace(stdout=stdout, stderr=stderr)


class FakeProc:
    def __init__(self, pid=4242, alive=True): self.pid, self._alive = pid, alive
    def poll(self): return None if self._alive else 1


def test_missing_assistant_is_reported_not_crashed(tmp_path):
    b = Bridge(tmp_path / "nope")
    assert b.lasthit_info() == {"available": False}
    assert not b.detect_heroes()["ok"] and "не найден" in b.detect_heroes()["error"]
    assert not b.overlay_start()["ok"]


def test_detect_parses_last_json_line(tmp_path):
    out = 'warning noise\n{"ok": true, "radiant": [], "dire": []}\n'
    b = Bridge(make_dir(tmp_path), run=lambda *a, **k: result(out))
    assert b.detect_heroes() == {"ok": True, "radiant": [], "dire": []}


def test_detect_survives_garbage_timeout_and_os_error(tmp_path):
    d = make_dir(tmp_path)
    assert "непонятный" in Bridge(d, run=lambda *a, **k: result("???", "Traceback...\nValueError: boom")).detect_heroes()["error"]
    def timeout(*a, **k): raise subprocess.TimeoutExpired("x", 1)
    assert "не ответил" in Bridge(d, run=timeout).detect_heroes()["error"]
    def oserr(*a, **k): raise OSError("denied")
    assert "denied" in Bridge(d, run=oserr).detect_heroes()["error"]


def test_save_settings_sends_json_as_one_argument(tmp_path):
    seen = {}
    def run(cmd, **k): seen["cmd"] = cmd; return result('{"ok": true, "values": {}}')
    Bridge(make_dir(tmp_path), run=run).save_settings({"melee_hp": 600, "текст": "я"})
    assert seen["cmd"][-2] == "settings-set" and json.loads(seen["cmd"][-1]) == {"melee_hp": 600, "текст": "я"}


def test_overlay_state_goes_stale(tmp_path):
    d = make_dir(tmp_path)
    (d / "status.json").write_text(json.dumps({"t": 100.0, "hero": "Axe", "in_game": True}))
    assert Bridge(d, clock=lambda: 101.0).overlay_state()["running"] is True
    assert Bridge(d, clock=lambda: 200.0).overlay_state()["running"] is False
    assert Bridge(make_dir(tmp_path / "x")).overlay_state()["running"] is False


def test_start_waits_for_first_status_then_reports_running(tmp_path):
    d = make_dir(tmp_path)
    now = [1000.0]
    launched = {}
    def popen(cmd, **k):
        launched["cmd"] = cmd; return FakeProc()
    def sleep(_):
        now[0] += 0.2
        if now[0] > 1000.5: (d / "status.json").write_text(json.dumps({"t": now[0], "pid": 4242, "hero": "Axe"}))
    b = Bridge(d, popen=popen, sleep=sleep, clock=lambda: now[0])
    r = b.overlay_start()
    assert r["ok"] and r["running"] and launched["cmd"][0].endswith("pythonw.exe") and launched["cmd"][1] == "main.py"


def test_start_reports_immediate_crash(tmp_path):
    d = make_dir(tmp_path)
    r = Bridge(d, popen=lambda *a, **k: FakeProc(alive=False), sleep=lambda _: None).overlay_start()
    assert not r["ok"] and "run.bat" in r["error"]


def test_start_does_not_launch_twice(tmp_path):
    d = make_dir(tmp_path)
    (d / "status.json").write_text(json.dumps({"t": 100.0, "pid": 1}))
    def popen(*a, **k): raise AssertionError("must not start a second overlay")
    assert Bridge(d, popen=popen, clock=lambda: 100.5).overlay_start()["ok"]


def test_stop_kills_overlay_and_clears_status(tmp_path):
    d = make_dir(tmp_path)
    (d / "status.json").write_text(json.dumps({"t": 100.0, "pid": 777}))
    killed = []
    b = Bridge(d, run=lambda cmd, **k: killed.append(cmd) or result(), clock=lambda: 100.5)
    assert b.overlay_stop() == {"ok": True, "running": False}
    assert any("777" in c for c in killed) and not (d / "status.json").exists()


def test_shutdown_only_stops_what_we_started(tmp_path):
    d = make_dir(tmp_path)
    killed = []
    b = Bridge(d, run=lambda cmd, **k: killed.append(cmd) or result())
    b.shutdown()
    assert killed == []                                   # never started anything: leave others alone
    b._proc = FakeProc(pid=55)
    b.shutdown()
    assert any("55" in c for c in killed)
