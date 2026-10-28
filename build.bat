@echo off
rem Собирает Dota2Stats.exe. Нужны: pip install pywebview pyinstaller pillow
rem Python берём из окружения помощника добивания (там всё уже стоит), иначе из системного.
set PY=%~dp0..\dota-lasthit\.venv\Scripts\python.exe
if not exist "%PY%" set PY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe
cd /d "%~dp0"
"%PY%" make_icon.py
"%PY%" -m PyInstaller --noconfirm --onefile --noconsole --name Dota2Stats --icon icon.ico --add-data "index.html;." --add-data "web;web" app.py
copy /y dist\Dota2Stats.exe Dota2Stats.exe
rmdir /s /q build dist
del Dota2Stats.spec
pause
