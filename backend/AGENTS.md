# Backend overview

This backend is a FastAPI service used to host the project web app and APIs.

## Current scope (Part 2 scaffolding)

- Serves a static hello page at `/` from `backend/static/index.html`.
- Exposes API endpoints:
	- `GET /api/health` -> health response
	- `GET /api/hello` -> sample API payload
- Static assets are mounted under `/static`.

## Key files

- `backend/app/main.py`: FastAPI application and routes.
- `backend/static/index.html`: hello page that performs a browser API call to `/api/hello`.
- `backend/requirements.txt`: Python dependencies.

## Run model

- Containerized via root `Dockerfile` and `docker-compose.yml`.
- Python dependencies are installed with `uv` in the Docker image.
- App runs with `uvicorn backend.app.main:app` on port `8000`.

## Next phase direction

- Replace hello static page with built frontend assets.
- Extend backend APIs for auth, board persistence, and AI integration in later parts.