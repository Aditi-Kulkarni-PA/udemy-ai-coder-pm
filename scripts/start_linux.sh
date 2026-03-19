#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

docker compose up --build -d

echo "pm-app started at http://localhost:8000"
