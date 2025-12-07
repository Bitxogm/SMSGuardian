#!/bin/bash
# build-fresh.sh - Script DEFINITIVO para compilar limpio SIEMPRE
# Limpia TODOS los cachés (JS y nativo) y recompila desde cero

set -e  # Salir si cualquier comando falla

echo "🧹 LIMPIEZA TOTAL Y RECOMPILACIÓN DESDE CERO"
echo "=============================================="
echo ""

# 1. Matar procesos
echo "1️⃣ Matando procesos existentes..."
pkill -f "expo start" 2>/dev/null || true
pkill -f "react-native start" 2>/dev/null || true
pkill -f "metro" 2>/dev/null || true
pkill -f "gradle" 2>/dev/null || true
sleep 2
echo "✅ Procesos terminados"
echo ""

# 2. Limpiar cachés de JavaScript/Metro
echo "2️⃣ Limpiando cachés de Metro bundler y node..."
rm -rf .metro
rm -rf $TMPDIR/metro-* 2>/dev/null || true
rm -rf $TMPDIR/react-* 2>/dev/null || true
rm -rf node_modules/.cache
rm -rf dist  # Limpiar exports anteriores
echo "✅ Cachés de Metro limpios"
echo ""

# 3. Limpiar cachés de Android/Gradle (incluyendo .gradle)
echo "3️⃣ Limpiando builds y cachés de Android..."
rm -rf android/app/build
rm -rf android/build
rm -rf android/.gradle
rm -rf ~/.gradle/caches/build-cache-*  # Caché de builds de Gradle
echo "✅ Builds de Android limpios"
echo ""

# 4. Generar bundle JavaScript fresco (Usando React Native CLI en lugar de Expo)
echo "4️⃣ Generando bundle JavaScript FRESCO..."
# Crear directorio de assets si no existe
mkdir -p android/app/src/main/assets
# Generar bundle manual
npx react-native bundle --platform android --dev false --entry-file index.js --bundle-output android/app/src/main/assets/index.android.bundle --assets-dest android/app/src/main/res
echo "✅ Bundle JavaScript generado"
echo ""

# 5. (Paso omitido: Copia manual no necesaria porque bundle ya está en assets)
echo "5️⃣ Bundle ya posicionado en assets."
echo ""

# 6. Compilar Android SIN cachés
echo "6️⃣ Compilando Android desde cero (sin cachés)..."
cd android
./gradlew clean
./gradlew assembleDebug --no-build-cache --rerun-tasks
cd ..
echo "✅ APK compilado"
echo ""

# 7. Verificar APK
if [ -f "android/app/build/outputs/apk/debug/app-debug.apk" ]; then
    APK_SIZE=$(du -h android/app/build/outputs/apk/debug/app-debug.apk | cut -f1)
    APK_TIME=$(stat -c %y android/app/build/outputs/apk/debug/app-debug.apk | cut -d'.' -f1)

    echo ""
    echo "✅✅✅ ¡APK CREADO EXITOSAMENTE! ✅✅✅"
    echo "======================================="
    echo "📦 Archivo: android/app/build/outputs/apk/debug/app-debug.apk"
    echo "📏 Tamaño: $APK_SIZE"
    echo "🕐 Creado: $APK_TIME"
    echo ""

    # Verificar contenido crítico
    echo "🔍 Verificando contenido del APK..."
    HAS_DIALER=$(unzip -l android/app/build/outputs/apk/debug/app-debug.apk | grep -c "DialerActivity" || echo "0")

    if [ "$HAS_DIALER" -gt "0" ]; then
        echo "   ✅ DialerActivity incluido"
    else
        echo "   ❌ WARNING: DialerActivity NO encontrado en APK"
    fi

    echo ""
    echo "📱 PASOS SIGUIENTES:"
    echo "   1. Copia el APK: cp android/app/build/outputs/apk/debug/app-debug.apk ~/Downloads/"
    echo "   2. Desinstala la app del teléfono completamente"
    echo "   3. Instala el nuevo APK"
    echo "   4. Prueba la funcionalidad"
    echo ""
else
    echo "❌ ERROR: No se pudo crear el APK"
    echo "Revisa los logs arriba para ver qué falló"
    exit 1
fi
