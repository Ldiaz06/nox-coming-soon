#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
CONFIG_FILE="$PROJECT_ROOT/.deploy.env"
MODE="${1:---dry-run}"
ONLY_FILE=""

case "$MODE" in
  --dry-run|--apply) ;;
  *)
    echo "Uso: $0 [--dry-run|--apply] [--only ruta-permitida]" >&2
    exit 2
    ;;
esac

if [[ $# -gt 1 ]]; then
  if [[ $# -ne 3 || "$2" != "--only" ]]; then
    echo "Uso: $0 [--dry-run|--apply] [--only ruta-permitida]" >&2
    exit 2
  fi
  ONLY_FILE="$3"
fi

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Falta $CONFIG_FILE." >&2
  echo "Copie .deploy.env.example como .deploy.env y complete el acceso al servidor." >&2
  exit 2
fi

# Este archivo pertenece al operador y no se acepta desde ninguna otra ruta.
# shellcheck disable=SC1090
source "$CONFIG_FILE"

required_variables=(
  PRODUCTION_SSH_TARGET
  PRODUCTION_ROOT
  PRODUCTION_BACKUP_ROOT
  PRODUCTION_HEALTH_URL
)

for variable_name in "${required_variables[@]}"; do
  if [[ -z "${!variable_name:-}" ]]; then
    echo "Falta $variable_name en .deploy.env." >&2
    exit 2
  fi
done

PRODUCTION_SSH_PORT="${PRODUCTION_SSH_PORT:-22}"

if [[ -n "${PRODUCTION_SSH_IDENTITY_FILE:-}" ]]; then
  if [[ ! -f "$PRODUCTION_SSH_IDENTITY_FILE" ]]; then
    echo "No existe PRODUCTION_SSH_IDENTITY_FILE: $PRODUCTION_SSH_IDENTITY_FILE" >&2
    exit 2
  fi
  ssh_identity_options=(-i "$PRODUCTION_SSH_IDENTITY_FILE")
else
  ssh_identity_options=()
fi

for command_name in rsync ssh curl php find xargs; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Falta el comando requerido: $command_name" >&2
    exit 2
  fi
done

if [[ "$PRODUCTION_ROOT" != /* || "$PRODUCTION_BACKUP_ROOT" != /* ]]; then
  echo "PRODUCTION_ROOT y PRODUCTION_BACKUP_ROOT deben ser rutas absolutas." >&2
  exit 2
fi

if [[ "$PRODUCTION_ROOT" == "/" || "$PRODUCTION_BACKUP_ROOT" == "/" ]]; then
  echo "Se rechazó una ruta de servidor insegura." >&2
  exit 2
fi

cd "$PROJECT_ROOT"

if [[ -n "$ONLY_FILE" ]]; then
  case "$ONLY_FILE" in
    /*|*..*|*'.DS_Store'|*'.gitkeep'|*.log|admin/public/uploads/products/*)
      echo "Ruta individual rechazada: $ONLY_FILE" >&2
      exit 2
      ;;
    assets/*|menu/*|admin/app/*|admin/db/*|admin/public/*)
      ;;
    *)
      echo "La ruta individual no pertenece a la lista permitida: $ONLY_FILE" >&2
      exit 2
      ;;
  esac

  if [[ ! -f "$PROJECT_ROOT/$ONLY_FILE" ]]; then
    echo "No existe el archivo solicitado: $ONLY_FILE" >&2
    exit 2
  fi
fi

echo "Validando sintaxis PHP..."
find admin/app admin/public -name '*.php' -print0 | xargs -0 -n1 php -l >/dev/null

ssh_options=(-p "$PRODUCTION_SSH_PORT" "${ssh_identity_options[@]}")
rsync_shell="ssh -p $PRODUCTION_SSH_PORT"
if [[ -n "${PRODUCTION_SSH_IDENTITY_FILE:-}" ]]; then
  rsync_shell+=" -i $PRODUCTION_SSH_IDENTITY_FILE"
fi
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_directory="$PRODUCTION_BACKUP_ROOT/$timestamp"

if [[ "$MODE" == "--apply" ]]; then
  ssh "${ssh_options[@]}" "$PRODUCTION_SSH_TARGET" \
    "mkdir -p -- '$PRODUCTION_ROOT/admin' '$PRODUCTION_ROOT/admin/config' '$backup_directory'"
fi

common_rsync_options=(
  --recursive
  --links
  --compress
  --itemize-changes
  --human-readable
  --checksum
  --omit-dir-times
  --backup
  "--backup-dir=$backup_directory"
  -e "$rsync_shell"
)

if [[ "$MODE" == "--dry-run" ]]; then
  common_rsync_options+=(--dry-run)
  echo "Vista previa: no se modificará producción."
else
  echo "Publicando en $PRODUCTION_SSH_TARGET:$PRODUCTION_ROOT"
fi

sync_directory() {
  local source_directory="$1"
  local destination_directory="$2"
  shift 2

  rsync "${common_rsync_options[@]}" --delete "$@" \
    "$PROJECT_ROOT/$source_directory/" \
    "$PRODUCTION_SSH_TARGET:$PRODUCTION_ROOT/$destination_directory/"
}

sync_files() {
  rsync "${common_rsync_options[@]}" \
    "$PROJECT_ROOT/index.html" \
    "$PROJECT_ROOT/styles.css" \
    "$PROJECT_ROOT/script.js" \
    "$PROJECT_ROOT/robots.txt" \
    "$PROJECT_ROOT/sitemap.xml" \
    "$PRODUCTION_SSH_TARGET:$PRODUCTION_ROOT/"
}

if [[ -n "$ONLY_FILE" ]]; then
  only_destination_directory="$(dirname -- "$ONLY_FILE")"
  if [[ "$MODE" == "--apply" ]]; then
    ssh "${ssh_options[@]}" "$PRODUCTION_SSH_TARGET" \
      "mkdir -p -- '$PRODUCTION_ROOT/$only_destination_directory'"
  fi
  rsync "${common_rsync_options[@]}" \
    "$PROJECT_ROOT/$ONLY_FILE" \
    "$PRODUCTION_SSH_TARGET:$PRODUCTION_ROOT/$ONLY_FILE"
else
  sync_files
  sync_directory assets assets --exclude='.DS_Store'
  sync_directory menu menu --exclude='.DS_Store'
  sync_directory admin/app admin/app --exclude='.DS_Store' --exclude='*.log'
  sync_directory admin/db admin/db --exclude='.DS_Store' --exclude='*.log'
  sync_directory admin/public admin/public \
    --exclude='.DS_Store' \
    --exclude='.gitkeep' \
    --exclude='*.log' \
    --exclude='/uploads/products/***'

  rsync "${common_rsync_options[@]}" \
    "$PROJECT_ROOT/admin/.htaccess" \
    "$PRODUCTION_SSH_TARGET:$PRODUCTION_ROOT/admin/.htaccess"
  rsync "${common_rsync_options[@]}" \
    "$PROJECT_ROOT/admin/config/.htaccess" \
    "$PRODUCTION_SSH_TARGET:$PRODUCTION_ROOT/admin/config/.htaccess"
fi

if [[ "$MODE" == "--dry-run" ]]; then
  echo "Vista previa terminada. Revise arriba la lista exacta de cambios."
  exit 0
fi

if [[ -z "$ONLY_FILE" ]]; then
  ssh "${ssh_options[@]}" "$PRODUCTION_SSH_TARGET" \
    "find '$PRODUCTION_ROOT/admin/app' '$PRODUCTION_ROOT/admin/public' -name '*.php' -exec php -l {} \\;"

  if [[ -n "${PRODUCTION_MYSQL_DEFAULTS_FILE:-}" ]]; then
    ssh "${ssh_options[@]}" "$PRODUCTION_SSH_TARGET" \
      "mysql --defaults-extra-file='$PRODUCTION_MYSQL_DEFAULTS_FILE' < '$PRODUCTION_ROOT/admin/db/schema.sql'"
  else
    echo "ADVERTENCIA: no se aplicó schema.sql; configure PRODUCTION_MYSQL_DEFAULTS_FILE." >&2
  fi
fi

health_response="$(curl --fail --silent --show-error --location --max-redirs 3 \
  --proto-redir '=https' --max-time 20 "$PRODUCTION_HEALTH_URL")"
if [[ "$health_response" != *'"ok":true'* ]]; then
  echo "El chequeo de salud no confirmó ok=true: $health_response" >&2
  exit 1
fi

echo "Despliegue completado y salud confirmada: $PRODUCTION_HEALTH_URL"
echo "Respaldo de archivos reemplazados: $backup_directory"
