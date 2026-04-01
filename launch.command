#!/bin/bash
# ── launch.command ──
# Simple launcher for Shelf on macOS.
# Double-click this file in Finder to open Shelf in your default browser.
#
# If macOS blocks it: right-click → Open → Open (first time only).
# This is the "no installation needed" option.
# For a proper .app desktop app, see BUILD.md.

# Change to the directory containing this script so relative paths work
cd "$(dirname "$0")"

echo "Starting Shelf..."
open index.html
