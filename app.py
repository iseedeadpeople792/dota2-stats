"""Десктопное окно для index.html (WebView2). Сборка в .exe: build.bat"""
import pathlib
import sys

import webview

from bridge import Bridge

base = pathlib.Path(getattr(sys, "_MEIPASS", pathlib.Path(__file__).parent))
data = pathlib.Path.home() / "AppData" / "Local" / "Dota2Stats"  # здесь хранится последний введённый аккаунт
data.mkdir(parents=True, exist_ok=True)

if __name__ == "__main__":
    bridge = Bridge()
    window = webview.create_window(
        "Dota 2 Статистика", str(base / "index.html"), width=1100, height=720, min_size=(900, 600),
        background_color="#0a0c11", js_api=bridge,
    )
    window.events.closed += bridge.shutdown
    webview.start(private_mode=False, storage_path=str(data), http_server=True)
