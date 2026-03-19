# Scripts overview

This folder contains start/stop scripts for local Docker-based runs.

## Scripts

- `start_mac.sh` / `stop_mac.sh`
- `start_linux.sh` / `stop_linux.sh`
- `start_windows.bat` / `stop_windows.bat`

## Behavior

- Start scripts run: `docker compose up --build -d`
- Stop scripts run: `docker compose down --remove-orphans`
- All scripts assume execution from inside the repository and use service/container name `pm-app`.