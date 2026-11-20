#!/usr/bin/env bash
# Restore alicenasartes.net from a backup made by deploy/backup.sh — run on the Raspberry Pi.
#
# Usage:
#   ./deploy/restore.sh                       # restores the newest dump + media
#   ./deploy/restore.sh path/to/db_....dump   # restores a specific dump + media
#   BACKUP_DIR=/media/usb/alicenasartes ./deploy/restore.sh
#
# WARNING: this REPLACES the current database contents with the backup.
# Stop the backend first (sudo systemctl stop <service>) and start it again afterwards.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${BACKEND_DIR:-$REPO_DIR/backend}"
ENV_FILE="${ENV_FILE:-$BACKEND_DIR/.env}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/alicenasartes}"

die() { echo "ERRO: $*" >&2; exit 1; }

env_value() {
  local key="$1" line
  line="$(grep -iE "^[[:space:]]*${key}[[:space:]]*=" "$ENV_FILE" | tail -n 1 || true)"
  line="${line#*=}"
  line="${line%$'\r'}"
  line="$(echo "$line" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g; s/^"(.*)"$/\1/; s/^'\''(.*)'\''$/\1/')"
  printf '%s' "$line"
}

[ -f "$ENV_FILE" ] || die "não encontrei $ENV_FILE"
command -v pg_restore >/dev/null || die "pg_restore não está instalado (sudo apt install postgresql-client)"

DUMP="${1:-$(ls -1t "$BACKUP_DIR"/db/db_*.dump 2>/dev/null | head -n 1 || true)}"
[ -n "$DUMP" ] && [ -f "$DUMP" ] || die "nenhum dump encontrado em $BACKUP_DIR/db"

DB_URL="$(env_value DATABASE_URL)"
[ -n "$DB_URL" ] || die "DATABASE_URL não está definido em $ENV_FILE"
DB_URL="$(echo "$DB_URL" | sed -E 's#^postgres(ql)?\+[a-z0-9_]+://#postgresql://#')"

MEDIA_ROOT="$(env_value MEDIA_ROOT)"
MEDIA_ROOT="${MEDIA_ROOT:-media}"
case "$MEDIA_ROOT" in
  /*) MEDIA_DIR="$MEDIA_ROOT" ;;
  *)  MEDIA_DIR="$BACKEND_DIR/$MEDIA_ROOT" ;;
esac

echo "Vai restaurar:"
echo "  base de dados <- $DUMP"
echo "  media         <- $BACKUP_DIR/media/  ->  $MEDIA_DIR"
echo "O conteúdo atual da base de dados será SUBSTITUÍDO."
read -r -p "Escreve 'sim' para continuar: " answer
[ "$answer" = "sim" ] || die "cancelado"

pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction --dbname="$DB_URL" "$DUMP"
echo "Base de dados restaurada."

if [ -d "$BACKUP_DIR/media" ]; then
  mkdir -p "$MEDIA_DIR"
  if command -v rsync >/dev/null; then
    rsync -a "$BACKUP_DIR/media/" "$MEDIA_DIR/"
  else
    cp -a "$BACKUP_DIR/media/." "$MEDIA_DIR/"
  fi
  echo "Media restaurada em $MEDIA_DIR."
fi

echo "Feito. Volta a arrancar o backend."
