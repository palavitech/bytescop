#!/usr/bin/env bash
set -euo pipefail

usage() {
    echo "Usage: ./reset-password.sh <email> [--password <password>]"
    echo
    echo "Reset a user's password."
    echo
    echo "Arguments:"
    echo "  email                  Email address of the user"
    echo
    echo "Options:"
    echo "  --password <password>  Set password non-interactively (default: interactive prompt)"
    echo "  -h, --help             Show this help message"
    echo
    echo "Examples:"
    echo "  ./reset-password.sh admin@example.com"
    echo "  ./reset-password.sh admin@example.com --password 'NewPass123!'"
}

if [ $# -lt 1 ] || [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    usage
    exit 0
fi

docker compose exec -it api python manage.py reset_password "$@"
