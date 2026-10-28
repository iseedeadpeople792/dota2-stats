"""Мост между страницей (JS) и помощником добивания из соседней папки dota-lasthit.

Помощник запускается его собственным Python (там OpenCV, захват окна и т.д.), поэтому
приложение статистики остаётся лёгким и собирается в .exe как раньше. Всё общение идёт через
команды `python -m lasthit.cli ...` и файл status.json.
"""
import json
import pathlib
import subprocess
import sys
import time

CREATE_NO_WINDOW = 0x08000000
STALE_AFTER = 3.0


def app_dir() -> pathlib.Path:
    return pathlib.Path(sys.executable).parent if getattr(sys, "frozen", False) else pathlib.Path(__file__).parent


class Bridge:
    """Публичные методы доступны странице как window.pywebview.api.<имя>()."""

    def __init__(self, lasthit_dir=None, run=subprocess.run, popen=subprocess.Popen, clock=time.time, sleep=time.sleep):
        self._dir = pathlib.Path(lasthit_dir) if lasthit_dir else app_dir().parent / "dota-lasthit"
        self._run, self._popen, self._clock, self._sleep = run, popen, clock, sleep
        self._proc = None

    # ---- внутреннее ----
    def _python(self, windowless=False):
        scripts = self._dir / ".venv" / "Scripts"
        exe = scripts / ("pythonw.exe" if windowless else "python.exe")
        return exe if exe.exists() else None

    def _status(self) -> dict:
        try:
            d = json.loads((self._dir / "status.json").read_text(encoding="utf8"))
        except (OSError, ValueError):
            return {"running": False}
        d["running"] = self._clock() - d.get("t", 0) < STALE_AFTER
        return d

    def _cli(self, *args, timeout=25) -> dict:
        py = self._python()
        if not py:
            return {"ok": False, "error": "Помощник добивания не найден рядом с приложением (папка dota-lasthit)."}
        try:
            r = self._run([str(py), "-m", "lasthit.cli", *args], cwd=str(self._dir), capture_output=True, text=True,
                          encoding="utf-8", timeout=timeout, creationflags=CREATE_NO_WINDOW)
        except subprocess.TimeoutExpired:
            return {"ok": False, "error": "Помощник не ответил вовремя."}
        except OSError as exc:
            return {"ok": False, "error": f"Не удалось запустить помощника: {exc}"}
        lines = [ln for ln in (r.stdout or "").splitlines() if ln.strip()]
        try:
            return json.loads(lines[-1])
        except (IndexError, ValueError):
            tail = (r.stderr or "").strip().splitlines()[-1:] or ["пустой ответ"]
            return {"ok": False, "error": f"Помощник вернул непонятный ответ: {tail[0]}"}

    # ---- для страницы ----
    def lasthit_info(self) -> dict:
        return {"available": self._python() is not None}

    def detect_heroes(self) -> dict:
        """Герои обеих команд по верхней панели игры (нужна запущенная Dota 2)."""
        return self._cli("detect")

    def get_settings(self) -> dict:
        return self._cli("settings-get")

    def save_settings(self, values) -> dict:
        return self._cli("settings-set", json.dumps(values, ensure_ascii=False))

    def overlay_state(self) -> dict:
        st = self._status()
        st["available"] = self._python() is not None
        return st

    def overlay_start(self) -> dict:
        py = self._python(windowless=True) or self._python()
        if not py:
            return {"ok": False, "error": "Помощник добивания не найден рядом с приложением (папка dota-lasthit)."}
        if self._status()["running"]:
            return {"ok": True, **self.overlay_state()}
        try:
            self._proc = self._popen([str(py), "main.py"], cwd=str(self._dir), creationflags=CREATE_NO_WINDOW)
        except OSError as exc:
            return {"ok": False, "error": f"Не удалось запустить помощника: {exc}"}
        for _ in range(30):                              # ждём первый отчёт о состоянии, до ~6 с
            self._sleep(0.2)
            if self._status()["running"]:
                return {"ok": True, **self.overlay_state()}
            if self._proc.poll() is not None:
                return {"ok": False, "error": "Помощник сразу завершился. Запусти run.bat в папке dota-lasthit и посмотри ошибку."}
        return {"ok": False, "error": "Помощник не ответил за 6 секунд."}

    def overlay_stop(self) -> dict:
        pid = self._status().get("pid")
        for target in filter(None, [pid, getattr(self._proc, "pid", None)]):
            try:
                self._run(["taskkill", "/PID", str(target), "/F", "/T"], capture_output=True, creationflags=CREATE_NO_WINDOW)
            except OSError:
                pass
        self._proc = None
        try:
            (self._dir / "status.json").unlink()
        except OSError:
            pass
        return {"ok": True, "running": False}

    def shutdown(self) -> None:
        """При закрытии окна гасим только то, что запустили сами."""
        if self._proc and self._proc.poll() is None:
            self.overlay_stop()
