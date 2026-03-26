#!/usr/bin/env sh
set -eu

# Default to production settings
if [ -z "${DJANGO_SETTINGS_MODULE:-}" ]; then
  export DJANGO_SETTINGS_MODULE="bytescop.settings.production"
fi

echo "[*] Using DJANGO_SETTINGS_MODULE=$DJANGO_SETTINGS_MODULE"

# Migrations are handled by install.sh / update.sh — not here.
# Running them from the entrypoint causes race conditions when
# multiple containers (api, workers, beat) start simultaneously.

echo "[*] Collecting static files..."
python manage.py collectstatic --noinput

echo "[*] Starting server..."
exec "$@"
