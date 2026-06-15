#!/bin/bash
# ─────────────────────────────────────────────────────────────
# EasyEdu — PostgreSQL Backup to Cloudflare R2
# ─────────────────────────────────────────────────────────────
# Usage:
#   ./ops/scripts/backup-postgres.sh
#
# Prerequisites:
#   - pg_dump installed (apt install postgresql-client)
#   - aws CLI installed and configured with R2 credentials
#   - Environment variables: DATABASE_URL, R2_ENDPOINT, R2_BACKUP_BUCKET
#
# Cron example (daily at 02:00 UTC):
#   0 2 * * * /opt/easyedu/ops/scripts/backup-postgres.sh >> /var/log/easyedu-backup.log 2>&1
# ─────────────────────────────────────────────────────────────
set -euo pipefail

DATE=$(date +%Y-%m-%d_%H-%M-%S)
FILE="easyedu_${DATE}.sql.gz"
TMP_DIR="/tmp/easyedu-backup"

# Ensure temp directory exists
mkdir -p "$TMP_DIR"

echo "[$(date)] Starting PostgreSQL backup..."

# Dump and compress
pg_dump "$DATABASE_URL" \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  | gzip > "${TMP_DIR}/${FILE}"

SIZE=$(du -h "${TMP_DIR}/${FILE}" | cut -f1)
echo "[$(date)] Dump complete: ${FILE} (${SIZE})"

# Upload to R2
aws s3 cp "${TMP_DIR}/${FILE}" \
  "s3://${R2_BACKUP_BUCKET:-easyedu-backups}/postgres/${FILE}" \
  --endpoint-url "${R2_ENDPOINT}"

echo "[$(date)] Uploaded to R2: s3://${R2_BACKUP_BUCKET:-easyedu-backups}/postgres/${FILE}"

# Cleanup local temp
rm -f "${TMP_DIR}/${FILE}"

# ── Retention: keep only last 30 daily backups on R2 ─────────
# Uncomment to enable automatic cleanup:
# aws s3 ls "s3://${R2_BACKUP_BUCKET:-easyedu-backups}/postgres/" \
#   --endpoint-url "${R2_ENDPOINT}" \
#   | sort -r \
#   | tail -n +31 \
#   | awk '{print $4}' \
#   | xargs -I{} aws s3 rm "s3://${R2_BACKUP_BUCKET:-easyedu-backups}/postgres/{}" \
#       --endpoint-url "${R2_ENDPOINT}"

echo "[$(date)] Backup complete."
