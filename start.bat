@echo off
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js non trovato. Installa la versione LTS da https://nodejs.org e riprova. & pause & exit /b 1)
if not exist .env copy .env.example .env >nul
start "" http://localhost:3000
node run.js
pause
