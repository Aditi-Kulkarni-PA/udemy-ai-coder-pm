@echo off
setlocal
cd /d "%~dp0.."

docker compose up --build -d
if errorlevel 1 exit /b 1

echo pm-app started at http://localhost:8000
