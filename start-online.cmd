@echo off
rem Starts the multiplayer server on this PC and opens a public address (ngrok or cloudflared). Keep this window open while people play.
cd /d "%~dp0"
call npm run share
pause
