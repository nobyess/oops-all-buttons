@echo off
cd /d "%~dp0"
if not exist ".venv-symbol-manager\Scripts\python.exe" (
  echo First run the setup commands in README.md under Built-in symbol library manager.
  pause
  exit /b 1
)
".venv-symbol-manager\Scripts\python.exe" symbol_library_manager.py
if errorlevel 1 pause
