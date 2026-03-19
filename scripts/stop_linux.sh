#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

docker compose down --remove-orphans

echo "pm-app stopped"
