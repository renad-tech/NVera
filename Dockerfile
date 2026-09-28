# NVera — one container serves the website and the API on a single URL.
# API keys are NOT in this image: set them as environment variables on the host (see docs/DEPLOY.md).

# 1) Build the website
FROM node:22-slim AS web
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# 2) The server (FastAPI) + the built website
FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ backend/
COPY scripts/ scripts/
# Sketchfab UID → Objaverse index (~13 MB), so Sketchfab winners can be downloaded from Objaverse
RUN python scripts/build_objaverse_index.py
COPY --from=web /app/frontend/dist frontend/dist
# Writable even if the host runs the container as a non-root user
RUN mkdir -p models memory logs && chmod 777 models memory logs

EXPOSE 8000
# Render sets $PORT; default to 8000 locally.
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
