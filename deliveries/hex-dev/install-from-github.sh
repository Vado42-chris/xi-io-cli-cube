#!/usr/bin/env bash
set -euo pipefail

# Bootstrap the exact tested HEX DEV package, then hand control to its UI.
# This does not enroll devices, start services, or qualify remote connectivity.
if [[ ${EUID} -eq 0 ]]; then
  printf '%s\n' 'Run this script as your normal user, not with sudo.' >&2
  exit 1
fi
[[ $(uname -s) == Linux && $(uname -m) == x86_64 ]] || { printf '%s\n' 'This package requires Linux x86_64.' >&2; exit 1; }
for tool in sudo apt dpkg-query sha256sum readlink; do
  command -v "$tool" >/dev/null 2>&1 || { printf 'Required bootstrap tool is unavailable: %s\n' "$tool" >&2; exit 1; }
done
download_dir=''
cleanup() {
  if [[ -n "$download_dir" ]]; then
    rm -f -- "$download_dir/xi-io-hex-dev_0.1.0-dev.1_amd64.deb"
    rmdir -- "$download_dir" 2>/dev/null || true
  fi
}
trap cleanup EXIT
if [[ $# -gt 0 ]]; then
  pkg=$1
else
  command -v curl >/dev/null || { printf '%s\n' 'curl is required to download the exact GitHub package.' >&2; exit 1; }
  download_dir=$(mktemp -d "${TMPDIR:-/tmp}/xiio-hex-bootstrap.XXXXXXXX")
  pkg="$download_dir/xi-io-hex-dev_0.1.0-dev.1_amd64.deb"
  curl --fail --location --proto '=https' --proto-redir '=https' --tlsv1.2 --retry 2 --output "$pkg" \
    'https://raw.githubusercontent.com/Vado42-chris/xi-io-cli-cube/5ad722a1dfed8c711ef8f50f590ba4c9ff1c6e1d/deliveries/hex-dev/0.1.0-dev.1/xi-io-hex-dev_0.1.0-dev.1_amd64.deb'
fi
[[ -f "$pkg" ]] || { printf 'Installer package not found: %s\n' "$pkg" >&2; exit 1; }
pkg=$(readlink -f -- "$pkg")
expected=cbeb9eb8b868a7c3ef8a46e712f78e8baf2efee0ed4f8b06c8b0afdbd99dfba6
actual=$(sha256sum -- "$pkg")
[[ ${actual%% *} == "$expected" ]] || { printf '%s\n' 'Checksum mismatch. Nothing installed.' >&2; exit 1; }
( : </dev/tty ) 2>/dev/null || { printf '%s\n' 'Open a normal interactive terminal and run this script there.' >&2; exit 1; }
expected_state=$'install ok installed\t0.1.0-dev.1\tamd64'
installed=$(dpkg-query -W -f='${Status}\t${Version}\t${Architecture}' xi-io-hex-dev 2>/dev/null || true)
if [[ -n "$installed" && "$installed" != "$expected_state" ]]; then
  printf '%s\n' 'A different or incomplete HEX DEV package is present. Nothing changed; review that installation before continuing.' >&2
  exit 1
fi
printf '%s\n' 'Verified HEX DEV package. Review the package-manager proposal before approving.' 
sudo apt install --no-remove --no-upgrade "$pkg" </dev/tty
installed=$(dpkg-query -W -f='${Status}\t${Version}\t${Architecture}' xi-io-hex-dev 2>/dev/null || true)
[[ "$installed" == "$expected_state" ]] || { printf '%s\n' 'The exact HEX DEV version was not installed. Nothing launched.' >&2; exit 1; }
binary=/usr/bin/xi-io-hex-dev
[[ -f "$binary" && -x "$binary" && ! -L "$binary" ]] || { printf '%s\n' 'Installed HEX DEV binary is missing or unexpected. Nothing launched.' >&2; exit 1; }
# SHA-256 of usr/bin/xi-io-hex-dev extracted from the exact package above.
expected_binary=0390073936614bbc7871bb1532b5b596121065c5cfc1296cda353621b7484503
actual_binary=$(sha256sum -- "$binary")
[[ ${actual_binary%% *} == "$expected_binary" ]] || { printf '%s\n' 'Installed HEX DEV binary differs from the verified package. Nothing launched.' >&2; exit 1; }
if [[ -z ${DISPLAY:-} && -z ${WAYLAND_DISPLAY:-} ]]; then
  printf '%s\n' 'HEX is installed. Open XI-IO HEX DEV from your graphical desktop to continue.'
  exit 0
fi
cleanup
download_dir=''
exec /usr/bin/xi-io-hex-dev
