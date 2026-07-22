#!/bin/bash
set -e

# Post-merge setup — runs automatically after each task merge.
# Must be idempotent and non-interactive.

echo "▶ Installing dependencies..."
npm install --legacy-peer-deps

echo "✓ Post-merge setup complete."
