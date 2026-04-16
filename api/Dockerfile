FROM python:3.13-slim

ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Minimal OS packages
# Build deps for psycopg2 (compiled from source for security patching)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl libpq-dev gcc libc6-dev libmagic1 && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir --upgrade pip

# Install deps (layer cached)
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copy app
COPY . /app

# Create directories for volumes
RUN mkdir -p /app/media /app/staticfiles /app/logs

# Non-root user
RUN adduser --disabled-password --no-create-home --gecos "" appuser \
    && chown -R appuser:appuser /app

# Entrypoint
RUN chmod +x /app/docker/entrypoint.sh

USER appuser

EXPOSE 8000

ENTRYPOINT ["/app/docker/entrypoint.sh"]
CMD ["gunicorn", "bytescop.wsgi:application", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "2", \
     "--threads", "4", \
     "--timeout", "120", \
     "--max-requests", "1000", \
     "--max-requests-jitter", "50", \
     "--access-logfile", "-", \
     "--error-logfile", "-"]
