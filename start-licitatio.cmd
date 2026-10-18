@echo off
rem Double-click to try Licitatio locally. Needs Node.js 20 or newer from https://nodejs.org
cd /d "%~dp0"
node scripts\start-local.mjs
if errorlevel 1 pause
