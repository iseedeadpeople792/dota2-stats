@echo off
rem Запуск из исходников (без сборки .exe): удобно при разработке.
cd /d "%~dp0"
"%~dp0..\dota-lasthit\.venv\Scripts\pythonw.exe" app.py
