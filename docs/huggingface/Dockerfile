# Hugging Face Space for NVera: pulls the code from GitHub and builds it.
# To update the live site after a push to GitHub: Space Settings -> Factory rebuild.

FROM alpine/git AS src
RUN git clone --depth 1 https://github.com/renad-tech/NVera.git /src

# 1) Build the website
FROM node:22-slim AS web
WORKDIR /app/frontend
COPY --from=src /src/frontend/ ./
RUN npm ci && npm run build

# 2) The server (FastAPI) + the built website
FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1
COPY --from=src /src/backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY --from=src /src/backend/ backend/
COPY --from=src /src/scripts/ scripts/
RUN python scripts/build_objaverse_index.py
COPY --from=web /app/frontend/dist frontend/dist
# Spaces run the container as a non-root user, so these must be writable
RUN mkdir -p models memory logs && chmod 777 models memory logs

EXPOSE 8000
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
