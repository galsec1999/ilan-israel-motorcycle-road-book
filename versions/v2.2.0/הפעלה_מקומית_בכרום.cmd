@echo off
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  start "Ilan Road Book PWA Server" /min py -m http.server 4173 --bind 127.0.0.1 --directory "%~dp0"
) else (
  start "Ilan Road Book PWA Server" /min python -m http.server 4173 --bind 127.0.0.1 --directory "%~dp0"
)
timeout /t 2 /nobreak >nul
start "" chrome "http://localhost:4173/"
if errorlevel 1 start "" "http://localhost:4173/"
