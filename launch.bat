@echo off
REM ── launch.bat ──
REM Simple launcher for Shelf on Windows.
REM Opens index.html in your default browser (Chrome, Edge, Firefox).
REM
REM This is the "no installation needed" option.
REM For a proper .exe desktop app, see the BUILD.md instructions.

echo Starting Shelf...
start "" "%~dp0index.html"
