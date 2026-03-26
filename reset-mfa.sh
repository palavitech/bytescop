#!/usr/bin/env bash
set -euo pipefail

usage() {
    echo "Usage: ./reset-mfa.sh <email> [--yes]"
    echo
    echo "Disable MFA for a user so they can log in and re-enroll."
    echo
    echo "Arguments:"
    echo "  email       Email address of the user"
    echo
    echo "Options:"
    echo "  --yes       Skip confirmation prompt"
    echo "  -h, --help  Show this help message"
    echo
    echo "Examples:"
    echo "  ./reset-mfa.sh admin@example.com"
    echo "  ./reset-mfa.sh admin@example.com --yes"
}

if [ $# -lt 1 ] || [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    usage
    exit 0
fi

docker compose exec -it api python manage.py reset_mfa "$@"
