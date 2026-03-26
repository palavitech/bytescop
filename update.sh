#!/usr/bin/env bash
set -euo pipefail

echo "========================================="
echo "  BytesCop — Update"
echo "========================================="
echo

# Create backup first
echo "Creating pre-update backup..."
./backup.sh

echo
echo "Pulling latest changes..."
git pull

echo "Rebuilding Docker images..."
docker compose build

echo "Restarting services..."
docker compose up -d

echo "Waiting for database to be ready..."
retries=0
max_retries=30
until docker compose exec -T db pg_isready -U "${POSTGRES_USER:-bytescop}" >/dev/null 2>&1; do
    retries=$((retries + 1))
    if [ "$retries" -ge "$max_retries" ]; then
        echo "Error: database did not become ready in time."
        exit 1
    fi
    sleep 2
done
echo "Database is ready."

echo "Running database migrations..."
docker compose exec -T api python manage.py migrate --no-input

echo "Seeding permissions and plans..."
docker compose exec -T api python manage.py seed_permissions
docker compose exec -T api python manage.py ensure_subscription_plans
docker compose exec -T api python manage.py ensure_classification_entries

echo
echo "========================================="
echo "  Update complete!"
echo "========================================="
echo
