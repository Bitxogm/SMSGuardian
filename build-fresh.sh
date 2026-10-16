#!/bin/bash
# build-fresh.sh - Debug APK compilado desde cero con un bundle JS fresco
# Solo toca rutas de este repo ignoradas por git.
# Ojo: ./gradlew --stop para todos los daemons de la misma versión de Gradle del usuario,
# no solo el de este proyecto.
# Uso: ./build-fresh.sh [--dry-run]

set -euo pipefail

DRY_RUN=0
case "${1:-}" in
  --dry-run) DRY_RUN=1 ;;
  "") ;;
  *) echo "Uso: $0 [--dry-run]" >&2; exit 2 ;;
esac

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${PROJECT_ROOT:?}"

BUNDLE="android/app/src/main/assets/index.android.bundle"
ASSETS_DEST="android/app/src/main/res"
APK="android/app/build/outputs/apk/debug/app-debug.apk"
AUTOLINKING_JSON="android/build/generated/autolinking/autolinking.json"
CLEAN_PATHS=(.metro node_modules/.cache android/app/build android/build android/app/.cxx android/.gradle dist)
COMPONENTS=(receivers.SMSReceiver receivers.MmsReceiver services.HeadlessSmsSendService)

REMOVED=()
SKIPPED=()
WARNINGS=()
FAILURES=()

log() { printf '%s\n' "$*"; }
step() { printf '\n%s\n' "$*"; }
warn() { WARNINGS+=("$*"); printf '⚠️  %s\n' "$*"; }
fail() { FAILURES+=("$*"); printf '❌ %s\n' "$*"; }
die() { printf '❌ %s\n' "$*" >&2; exit 1; }

run() {
  if (( DRY_RUN )); then
    printf '[dry-run] %s\n' "$*"
  else
    "$@"
  fi
}

run_in_android() {
  if (( DRY_RUN )); then
    printf '[dry-run] (cd android && %s)\n' "$*"
  else
    (cd android && "$@")
  fi
}

# Deletes a repo path only if it exists and git ignores it
remove_path() {
  local rel="${1:-}"

  if [[ -z "$rel" || "$rel" == /* || "$rel" == *..* ]]; then
    warn "Ruta rechazada (vacía, absoluta o con '..'): '$rel'. No se borra"
    SKIPPED+=("'$rel'")
    return 0
  fi

  local target="${PROJECT_ROOT:?}/${rel:?}"

  [[ -e "$target" ]] || return 0

  if ! git check-ignore -q -- "$rel"; then
    warn "$rel no está ignorada por git: no se borra"
    SKIPPED+=("$rel")
    return 0
  fi

  if (( DRY_RUN )); then
    log "[dry-run] rm -rf -- $target"
  else
    rm -rf -- "$target"
    log "   borrado: $rel"
  fi
  REMOVED+=("$rel")
}

find_build_tool() {
  local tool="${1:?}" sdk="" version
  if [[ -n "${ANDROID_HOME:-}" ]]; then
    sdk="$ANDROID_HOME"
  elif [[ -n "${ANDROID_SDK_ROOT:-}" ]]; then
    sdk="$ANDROID_SDK_ROOT"
  elif [[ -f android/local.properties ]]; then
    sdk="$(sed -n 's/^sdk\.dir=//p' android/local.properties)"
  fi
  [[ -n "$sdk" && -d "$sdk/build-tools" ]] || return 1

  version="$(find "$sdk/build-tools" -mindepth 1 -maxdepth 1 -printf '%f\n' | grep -v -- '-rc' | sort -V | tail -n 1)"
  [[ -n "$version" && -x "$sdk/build-tools/$version/$tool" ]] || return 1
  printf '%s\n' "$sdk/build-tools/$version/$tool"
}

SECONDS=0
git_status_before="$(git status --porcelain --untracked-files=all)"
if (( DRY_RUN )); then log "🔎 MODO DRY-RUN: no se borra ni se ejecuta nada"; fi
log "📁 Proyecto: $PROJECT_ROOT"

step "1️⃣ Preflight"
if ss -ltn 'sport = :8081' 2>/dev/null | grep -q LISTEN; then
  warn "El puerto 8081 está ocupado (¿Metro?). No se mata: un APK debug podría cargar el JS de ese servidor en vez del bundle embebido"
fi

if [[ -f "$AUTOLINKING_JSON" ]]; then
  linked_root="$(node -e 'process.stdout.write(String(require(process.argv[1]).root || ""))' "$PROJECT_ROOT/$AUTOLINKING_JSON")"
  if [[ "$linked_root" != "$PROJECT_ROOT" ]]; then
    warn "autolinking.json apunta a '$linked_root' y el proyecto está en '$PROJECT_ROOT': se limpia lo generado en android/build y android/app/build"
  else
    log "   autolinking.json apunta a la ruta actual"
  fi
fi

step "2️⃣ Parando el daemon de Gradle (./gradlew --stop)"
run_in_android ./gradlew --stop

step "3️⃣ Limpiando artefactos del proyecto"
for rel in "${CLEAN_PATHS[@]}"; do
  remove_path "$rel"
done

step "4️⃣ Generando bundle JavaScript fresco (--dev false --reset-cache)"
run mkdir -p "$(dirname "${BUNDLE:?}")"
bundle_start="$(date +%s)"
run npx react-native bundle \
  --platform android \
  --dev false \
  --reset-cache \
  --entry-file index.js \
  --bundle-output "$BUNDLE" \
  --assets-dest "$ASSETS_DEST"

if (( ! DRY_RUN )); then
  [[ -s "$BUNDLE" ]] || die "El bundle no existe o está vacío: no se compila con JS antiguo"
  bundle_mtime="$(stat -c %Y "$BUNDLE")"
  (( bundle_mtime >= bundle_start )) || die "El bundle no se ha generado en esta ejecución: no se compila con JS antiguo"
  log "   bundle: $BUNDLE ($(du -h "$BUNDLE" | cut -f1))"
fi

step "5️⃣ Compilando APK debug (--no-build-cache --rerun-tasks)"
run_in_android ./gradlew assembleDebug --no-build-cache --rerun-tasks

if (( DRY_RUN )); then
  step "6️⃣ Verificación del APK, firma y git status: se omiten en dry-run"
else
  step "6️⃣ Verificando el APK"
  [[ -f "$APK" ]] || die "No se ha generado $APK"

  aapt_bin="$(find_build_tool aapt || true)"
  if [[ -n "$aapt_bin" ]]; then
    manifest_dump="$("$aapt_bin" dump xmltree "$APK" AndroidManifest.xml)"
  else
    warn "aapt no encontrado: solo se comprueban las clases del dex"
    manifest_dump=""
  fi
  dex_strings="$(unzip -p "$APK" 'classes*.dex' | strings)"

  for component in "${COMPONENTS[@]}"; do
    class_name="${component##*.}"
    dex_ref="Lcom/smsguardian/${component//.//};"
    in_dex="no"
    in_manifest="sin aapt"
    if grep -qF -- "$dex_ref" <<< "$dex_strings"; then in_dex="sí"; fi
    if [[ -n "$manifest_dump" ]]; then
      in_manifest="no"
      if grep -qF -- "$component" <<< "$manifest_dump"; then in_manifest="sí"; fi
    fi
    if [[ "$in_dex" == "sí" && "$in_manifest" != "no" ]]; then
      log "   ✅ $class_name (manifest: $in_manifest, dex: $in_dex)"
    else
      fail "$class_name falta en el APK (manifest: $in_manifest, dex: $in_dex)"
    fi
  done

  step "7️⃣ Certificado de firma"
  apksigner_bin="$(find_build_tool apksigner || true)"
  if [[ -n "$apksigner_bin" ]]; then
    cert_sha256="$("$apksigner_bin" verify --print-certs "$APK" | sed -n 's/.*certificate SHA-256 digest: //p' | head -n 1)"
  else
    cert_sha256="$(keytool -printcert -jarfile "$APK" | sed -n 's/^[[:space:]]*SHA256: //p' | head -n 1)"
  fi
  log "   SHA-256: ${cert_sha256:-no disponible}"

  step "8️⃣ Cambios en el repo durante esta ejecución"
  git_status_after="$(git status --porcelain --untracked-files=all)"
  build_changes="$(comm -13 <(sort <<< "$git_status_before") <(sort <<< "$git_status_after"))"
  if [[ -z "$build_changes" ]]; then
    log "   Ningún fichero trackeado ni asset nuevo ha cambiado (git status igual que al empezar)"
  else
    warn "git status ha cambiado durante el build (no se revierte):"$'\n'"$build_changes"
  fi
fi

step "📋 RESUMEN"
if (( DRY_RUN )); then log "Modo: dry-run (no se ha borrado ni ejecutado nada)"; fi
log "Tiempo: ${SECONDS}s"
if (( DRY_RUN )); then removed_label="que se borrarían"; else removed_label="borradas"; fi
log "Rutas $removed_label: ${REMOVED[*]:-ninguna}"
if (( ${#SKIPPED[@]} )); then log "Rutas no borradas por no estar ignoradas: ${SKIPPED[*]}"; fi
if (( ! DRY_RUN )); then
  log "APK: $APK ($(du -h "$APK" | cut -f1))"
  log "Firma SHA-256: ${cert_sha256:-no disponible}"
  log ""
  log "📱 Instálalo encima de la versión actual: se conservan los datos de la app."
  log "   Desinstala solo si Android informa de un conflicto de paquete o de firma."
fi
if (( ${#WARNINGS[@]} )); then
  log ""
  log "Avisos:"
  printf '  - %s\n' "${WARNINGS[@]}"
fi
if (( ${#FAILURES[@]} )); then
  log ""
  log "Fallos:"
  printf '  - %s\n' "${FAILURES[@]}"
  exit 1
fi
