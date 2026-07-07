# Production image for backend, celery_worker, and mcp (they differ only by command).
# Build from the REPO ROOT so documentation/ can be included:
#   docker build -f backend/Dockerfile -t roster-backend:<tag> .
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

RUN groupadd -g 1000 appuser && useradd -u 1000 -g 1000 -m appuser

COPY --chown=appuser:appuser backend/alembic.ini ./alembic.ini
COPY --chown=appuser:appuser backend/alembic ./alembic
COPY --chown=appuser:appuser backend/solver ./solver
COPY --chown=appuser:appuser backend/app ./app
COPY --chown=appuser:appuser documentation ./documentation

USER appuser

EXPOSE 8000

# Default command runs the API; the worker and MCP server override this.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
