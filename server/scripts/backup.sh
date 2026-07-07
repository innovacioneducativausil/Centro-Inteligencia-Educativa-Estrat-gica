#!/bin/bash
# CIEE - Backup de bases de datos MySQL
# TI-26: Almacenar información histórica con backup periódico
#
# Uso:
#   bash server/scripts/backup.sh
#
# Variables de entorno requeridas (leer desde .env o Railway Variables):
#   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD  → radar_carreras
#   DB_HOST_EMPL, DB_PASSWORD_EMPL          → empleabilidad_usil
#   DB_HOST_CURR, DB_PASSWORD_CURR          → mallas_usil
#
# Configurar en Railway como cron job o ejecutar manualmente.

set -e

# ── Configuración ──────────────────────────────────────────
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-ciee_user}"

# ── Validar variables requeridas ───────────────────────────
if [ -z "$DB_HOST" ] || [ -z "$DB_PASSWORD" ]; then
  echo "[BACKUP] ERROR: DB_HOST y DB_PASSWORD son requeridos."
  exit 1
fi

mkdir -p "$BACKUP_DIR"

echo "[BACKUP] Iniciando backup — $TIMESTAMP"

# ── Función de backup por base de datos ───────────────────
backup_db() {
  local db_name="$1"
  local host="$2"
  local user="${3:-$DB_USER}"
  local password="$4"
  local port="${5:-$DB_PORT}"
  local outfile="$BACKUP_DIR/${db_name}_${TIMESTAMP}.sql.gz"

  echo "[BACKUP] Exportando $db_name desde $host..."

  MYSQL_PWD="$password" mysqldump \
    --host="$host" \
    --port="$port" \
    --user="$user" \
    --single-transaction \
    --routines \
    --triggers \
    --add-drop-table \
    "$db_name" | gzip > "$outfile"

  local size=$(du -sh "$outfile" | cut -f1)
  echo "[BACKUP] OK: $outfile ($size)"
}

# ── Ejecutar backups ───────────────────────────────────────
backup_db "radar_carreras" \
  "$DB_HOST" "$DB_USER" "$DB_PASSWORD" "$DB_PORT"

backup_db "empleabilidad_usil" \
  "${DB_HOST_EMPL:-$DB_HOST}" \
  "${DB_USER_EMPL:-$DB_USER}" \
  "${DB_PASSWORD_EMPL:-$DB_PASSWORD}" \
  "${DB_PORT_EMPL:-$DB_PORT}"

backup_db "mallas_usil" \
  "${DB_HOST_CURR:-$DB_HOST}" \
  "${DB_USER_CURR:-$DB_USER}" \
  "${DB_PASSWORD_CURR:-$DB_PASSWORD}" \
  "${DB_PORT_CURR:-$DB_PORT}"

# ── Limpiar backups antiguos ───────────────────────────────
echo "[BACKUP] Eliminando backups anteriores a $RETENTION_DAYS días..."
find "$BACKUP_DIR" -name "*.sql.gz" -mtime "+$RETENTION_DAYS" -delete
echo "[BACKUP] Limpieza completada."

# ── Resumen ────────────────────────────────────────────────
echo "[BACKUP] Backup completado — $(date)"
echo "[BACKUP] Archivos en $BACKUP_DIR:"
ls -lh "$BACKUP_DIR"/*.sql.gz 2>/dev/null || echo "  (ninguno)"
