#!/usr/bin/env bash
# Construye una candidata iOS firmada para distribucion y deja constancia de su
# procedencia. No sube nada: subir es un paso aparte y deliberado.
#
# Las credenciales no viven aqui. La identidad de firma sale del llavero del
# sistema y el perfil de App Store lo resuelve Xcode por su nombre.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
MOBILE="$REPO_ROOT/apps/mobile"
OUT="$REPO_ROOT/artifacts/release"
BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT

SCHEME="ManualSAMUR"
WORKSPACE="$MOBILE/ios/$SCHEME.xcworkspace"
TEAM_ID="${SAMUR_TEAM_ID:-FC8DH72682}"
# Firma manual y explicita. `expo prebuild --clean` rehace el proyecto sin equipo
# de desarrollo, asi que el archive falla con "requires a development team" si no
# se le dicen aqui. Se firma contra el perfil de App Store ya instalado en la
# maquina; el certificado sale del llavero y no se guarda nada en el repositorio.
PROFILE_NAME="${SAMUR_PROFILE:-Manual SAMUR App Store}"
SIGN_IDENTITY="${SAMUR_SIGN_IDENTITY:-iPhone Distribution}"
BUNDLE_ID="$(node -p "require('$MOBILE/app.json').expo.ios.bundleIdentifier")"

VERSION="$(node -p "require('$MOBILE/app.json').expo.version")"
BUILD_NUMBER="$(node -p "require('$MOBILE/app.json').expo.ios.buildNumber")"
COMMIT="$(git -C "$REPO_ROOT" rev-parse HEAD)"
DIRTY="$(git -C "$REPO_ROOT" status --porcelain | wc -l | tr -d ' ')"

echo "==> Manual SAMUR $VERSION ($BUILD_NUMBER) desde $COMMIT"
if [ "$DIRTY" != "0" ]; then
  echo "    AVISO: el arbol de trabajo tiene $DIRTY cambios sin confirmar."
  echo "    La candidata no sera reproducible a partir del commit registrado."
fi

echo "==> Paquete de contenido"
( cd "$REPO_ROOT" && npm run --silent mobile:content )
CONTENT_HASH="$(node -p "require('$MOBILE/src/data/snapshot.json').packageHash")"
echo "    packageHash $CONTENT_HASH"

echo "==> Prebuild nativo"
( cd "$MOBILE" && npx expo prebuild --platform ios --clean )

cat > "$BUILD_DIR/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>teamID</key><string>$TEAM_ID</string>
  <key>uploadSymbols</key><true/>
  <key>signingStyle</key><string>manual</string>
  <key>signingCertificate</key><string>$SIGN_IDENTITY</string>
  <key>provisioningProfiles</key>
  <dict><key>$BUNDLE_ID</key><string>$PROFILE_NAME</string></dict>
  <key>destination</key><string>export</string>
</dict>
</plist>
PLIST

echo "==> Archive"
xcodebuild -quiet \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "$BUILD_DIR/$SCHEME.xcarchive" \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  CODE_SIGN_STYLE=Manual \
  CODE_SIGN_IDENTITY="$SIGN_IDENTITY" \
  PROVISIONING_PROFILE_SPECIFIER="$PROFILE_NAME" \
  archive

echo "==> Export"
xcodebuild -quiet \
  -exportArchive \
  -archivePath "$BUILD_DIR/$SCHEME.xcarchive" \
  -exportOptionsPlist "$BUILD_DIR/ExportOptions.plist" \
  -exportPath "$BUILD_DIR/export"

mkdir -p "$OUT"
IPA_SRC="$(find "$BUILD_DIR/export" -name '*.ipa' -print -quit)"
IPA="$OUT/$SCHEME-$VERSION-$BUILD_NUMBER.ipa"
cp "$IPA_SRC" "$IPA"

# Sin tuberias con salida temprana: bajo `set -o pipefail`, un `awk ... exit` o un
# `head -1` cierran el descriptor antes de que el productor termine, este recibe
# SIGPIPE y el script entero muere con 141 —despues de haber archivado y exportado
# correctamente, que es la peor forma de fallar. Se captura primero y se filtra
# despues, sobre una variable.
APP="$(find "$BUILD_DIR/$SCHEME.xcarchive/Products/Applications" -maxdepth 1 -name '*.app' -print -quit)"
CODESIGN_OUT="$(codesign -dv --verbose=2 "$APP" 2>&1 || true)"
AUTHORITY="$(printf '%s\n' "$CODESIGN_OUT" | awk -F'=' '/^Authority=/{print $2}' | sed -n 1p)"
security cms -D -i "$APP/embedded.mobileprovision" > "$BUILD_DIR/profile.plist" 2>/dev/null
PROFILE="$(/usr/libexec/PlistBuddy -c 'Print :Name' "$BUILD_DIR/profile.plist")"
BETA="$(/usr/libexec/PlistBuddy -c 'Print :Entitlements:beta-reports-active' "$BUILD_DIR/profile.plist" 2>/dev/null || echo false)"

SHA="$(shasum -a 256 "$IPA" | awk '{print $1}')"
BYTES="$(stat -f %z "$IPA")"

cat > "$OUT/$SCHEME-$VERSION-$BUILD_NUMBER.provenance.json" <<JSON
{
  "artifact": "$(basename "$IPA")",
  "version": "$VERSION",
  "buildNumber": "$BUILD_NUMBER",
  "commit": "$COMMIT",
  "worktreeDirtyFiles": $DIRTY,
  "contentPackageHash": "$CONTENT_HASH",
  "sha256": "$SHA",
  "bytes": $BYTES,
  "signingAuthority": "$AUTHORITY",
  "provisioningProfile": "$PROFILE",
  "betaReportsActive": $BETA,
  "builtAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "builtWith": { "node": "$(node -v)", "xcode": "$(xcodebuild -version | sed -n 1p)" }
}
JSON

echo
echo "==> Candidata lista"
echo "    $IPA"
echo "    sha256 $SHA"
echo "    $BYTES bytes"
echo "    firma  $AUTHORITY"
echo "    perfil $PROFILE (beta-reports-active: $BETA)"
