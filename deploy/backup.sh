#!/usr/bin/env bash
# Backup for alicenasartes.net — run on the Raspberry Pi.
#
# Saves the two things that are NOT in git:
#   1. the PostgreSQL database  -> <BACKUP_DIR>/db/db_YYYY-MM-DD_HHMM.dump  (pg_dump custom format)
#   2. the uploaded media files -> <BACKUP_DIR>/media/                      (mirror, only new files are copied)
#
# Usage (from anywhere):
#   ./deploy/backup.sh
#   BACKUP_DIR=/media/usb/alicenasartes ./deploy/backup.sh     # e.g. to a USB drive
#   KEEP=60 ./deploy/backup.sh                                  # keep the last 60 database dumps (default 30)
#
# Daily at 03:30 (crontab -e):
#   30 3 * * * /path/to/siteMae/deploy/backup.sh >> $HOME/backups/alicenasartes/backup.log 2>&1
#
# Restore with ./deploy/restore.sh

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${BACKEND_DIR:-$REPO_DIR/backend}"
ENV_FILE="${ENV_FILE:-$BACKEND_DIR/.env}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/alicenasartes}"
KEEP="${KEEP:-30}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
die() { log "ERRO: $*"; exit 1; }

# Read KEY=value from .env without executing it (values may be quoted)
env_value() {
  local key="$1" line
  line="$(grep -iE "^[[:space:]]*${key}[[:space:]]*=" "$ENV_FILE" | tail -n 1 || true)"
  line="${line#*=}"
  line="${line%$'\r'}"
  line="$(echo "$line" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g; s/^"(.*)"$/\1/; s/^'\''(.*)'\''$/\1/')"
  printf '%s' "$line"
}

[ -f "$ENV_FILE" ] || die "não encontrei $ENV_FILE"
command -v pg_dump >/dev/null || die "pg_dump não está instalado (sudo apt install postgresql-client)"

DB_URL="$(env_value DATABASE_URL)"
[ -n "$DB_URL" ] || die "DATABASE_URL não está definido em $ENV_FILE"
# SQLAlchemy URLs look like postgresql+psycopg2://...; pg_dump wants postgresql://...
DB_URL="$(echo "$DB_URL" | sed -E 's#^postgres(ql)?\+[a-z0-9_]+://#postgresql://#')"

MEDIA_ROOT="$(env_value MEDIA_ROOT)"
MEDIA_ROOT="${MEDIA_ROOT:-media}"
case "$MEDIA_ROOT" in
  /*) MEDIA_DIR="$MEDIA_ROOT" ;;
  *)  MEDIA_DIR="$BACKEND_DIR/$MEDIA_ROOT" ;;   # the backend runs from backend/, so "media" means backend/media
esac

mkdir -p "$BACKUP_DIR/db" "$BACKUP_DIR/media"
STAMP="$(date '+%Y-%m-%d_%H%M')"
DUMP="$BACKUP_DIR/db/db_$STAMP.dump"

# 1. Database — write to a temp file first so a failed dump never looks like a good one
log "Base de dados -> $DUMP"
trap 'rm -f "$DUMP.part"' EXIT
pg_dump --format=custom --no-owner --no-privileges --dbname="$DB_URL" --file="$DUMP.part"
mv "$DUMP.part" "$DUMP"

# 2. Media — uploads have UUID names and never change, so only new files are copied.
#    Nothing is deleted from the backup, so a file removed by mistake on the site is still here.
if [ -d "$MEDIA_DIR" ]; then
  log "Media $MEDIA_DIR -> $BACKUP_DIR/media/"
  if command -v rsync >/dev/null; then
    rsync -a "$MEDIA_DIR/" "$BACKUP_DIR/media/"
  else
    cp -a -n "$MEDIA_DIR/." "$BACKUP_DIR/media/"
  fi
else
  log "AVISO: pasta de media não encontrada ($MEDIA_DIR) — só a base de dados foi copiada"
fi

# 3. Keep only the newest $KEEP database dumps
mapfile -t OLD < <(ls -1t "$BACKUP_DIR"/db/db_*.dump 2>/dev/null | tail -n +"$((KEEP + 1))")
if [ "${#OLD[@]}" -gt 0 ]; then
  rm -f -- "${OLD[@]}"
  log "Apagados ${#OLD[@]} dump(s) antigos (mantidos os últimos $KEEP)"
fi

log "Concluído: $(du -sh "$DUMP" | cut -f1) base de dados, $(du -sh "$BACKUP_DIR/media" | cut -f1) media em $BACKUP_DIR"
