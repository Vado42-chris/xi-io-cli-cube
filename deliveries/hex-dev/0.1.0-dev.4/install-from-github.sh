#!/usr/bin/env bash
set -euo pipefail
# Install/open the exact HEX DEV candidate. No device enrollment or connection claim.
# The existing HEX UI performs its bounded local installation steps.
fail() { printf '%s\n' "$*" >&2; exit 1; }
[[ ${EUID} -ne 0 ]] || fail 'Run as your normal desktop user, not with sudo.'
[[ $(uname -s) == Linux && $(uname -m) == x86_64 ]] || fail 'This candidate requires Linux x86_64.'
for tool in sudo apt-get dpkg-query dpkg-deb sha256sum readlink pgrep; do
  command -v "$tool" >/dev/null 2>&1 || fail "Required bootstrap tool is unavailable: $tool"
done
( : </dev/tty ) 2>/dev/null || fail 'Open a normal interactive terminal and run this script there.'
[[ $# -le 1 ]] || fail 'Supply at most one local package path.'
version=0.1.0-dev.4
package=xi-io-hex-dev
binary=/usr/bin/xi-io-hex-dev
expected_package=542ac3616e90db38fe2abe0852715134fadc31203e5bd765df2066cd46dc5a52
expected_binary=069ed738e66cb5b13b090dbd6008ce132632962fd937f45c3ac85db2643ae1ad
previous_binary=0390073936614bbc7871bb1532b5b596121065c5cfc1296cda353621b7484503
payload_commit=3e69911ce9a4385b0a5776c24e11365e2225f60f
state() {
  local value code
  if value=$(LC_ALL=C dpkg-query -W -f='${Status}\t${Version}\t${Architecture}' "$package" 2>/dev/null); then
    printf '%s' "$value"
  else
    code=$?; [[ $code -eq 1 && -z "$value" ]] || fail 'Installed package metadata cannot be read. Nothing changed.'
  fi
}
verify_binary() {
  [[ -f "$binary" && -x "$binary" && ! -L "$binary" ]] || fail 'Installed HEX DEV binary is missing or unexpected. Nothing launched.'
  local actual; actual=$(sha256sum -- "$binary")
  [[ ${actual%% *} == "$1" ]] || fail 'Installed HEX DEV binary differs from its verified version. Refusing to continue or launch.'
}
require_closed() {
  local code
  if pgrep -x xi-io-hex-dev >/dev/null; then
    fail 'Close XI-IO HEX DEV normally, then rerun this script. No running application will be stopped.'
  else
    code=$?; [[ $code -eq 1 ]] || fail 'Cannot determine whether HEX DEV is running. Nothing changed.'
  fi
}
expected_state=$'install ok installed\t0.1.0-dev.4\tamd64'
previous_state=$'install ok installed\t0.1.0-dev.1\tamd64'
initial_state=$(state)
case "$initial_state" in
  '') mode=fresh ;;
  "$previous_state") verify_binary "$previous_binary"; mode=upgrade ;;
  "$expected_state") verify_binary "$expected_binary"; mode=current ;;
  *) fail 'Unknown or incomplete HEX DEV version is installed. This bootstrap only accepts a fresh install or verified DEV.1 → DEV.4 upgrade.' ;;
esac
require_closed

download_dir=''
cleanup() {
  if [[ -n "$download_dir" ]]; then
    rm -f -- "$download_dir/xi-io-hex-dev_0.1.0-dev.4_amd64.deb"
    rmdir -- "$download_dir" 2>/dev/null || true
  fi
}
trap cleanup EXIT
if [[ $# -eq 1 ]]; then
  pkg=$1
else
  [[ $payload_commit =~ ^[0-9a-f]{40}$ ]] || fail 'This bootstrap is not published yet: its immutable payload commit is unset.'
  for tool in curl mktemp chmod; do command -v "$tool" >/dev/null || fail "Download tool unavailable: $tool"; done
  download_dir=$(mktemp -d "${TMPDIR:-/tmp}/xiio-hex-bootstrap.XXXXXXXX")
  pkg="$download_dir/xi-io-hex-dev_0.1.0-dev.4_amd64.deb"
  curl --fail --location --proto '=https' --proto-redir '=https' --tlsv1.2 --retry 2 --output "$pkg" \
    "https://raw.githubusercontent.com/Vado42-chris/xi-io-cli-cube/$payload_commit/deliveries/hex-dev/0.1.0-dev.4/xi-io-hex-dev_0.1.0-dev.4_amd64.deb"
  # Public package only; allow apt's unprivileged downloader to read our new temp file.
  chmod 755 "$download_dir"; chmod 644 "$pkg"
fi
[[ -f "$pkg" ]] || fail "Installer package not found: $pkg"
pkg=$(readlink -f -- "$pkg")
actual=$(sha256sum -- "$pkg")
[[ ${actual%% *} == "$expected_package" ]] || fail 'Checksum mismatch. Nothing installed.'
metadata=$(dpkg-deb -f "$pkg" Package Version Architecture)
[[ "$metadata" == $'Package: xi-io-hex-dev\nVersion: 0.1.0-dev.4\nArchitecture: amd64' ]] || fail 'Package metadata mismatch. Nothing installed.'

if [[ "$mode" != current ]]; then
  options=(--no-remove --no-install-recommends -o APT::Get::Assume-Yes=false -o APT::Get::Assume-No=false -o APT::Get::AutomaticRemove=false)
  simulation=$(LC_ALL=C apt-get --simulate "${options[@]}" install "$pkg") || fail 'Package simulation failed. Nothing installed.'
  planned_target=false
  while IFS= read -r line; do
    case "$line" in
      Remv\ *|Purg\ *) fail 'Simulation proposes removing a package. Nothing installed.' ;;
      Inst\ *)
        rest=${line#Inst }; name=${rest%% *}; rest=${rest#* }; name=${name%:amd64}
        if [[ "$name" == "$package" ]]; then
          [[ "$rest" == *"($version "* ]] || fail 'Simulation selected an unexpected HEX version. Nothing installed.'
          planned_target=true
        elif [[ "$rest" == \[* ]]; then
          fail "Simulation would update unrelated package $name. Nothing installed."
        fi
        ;;
    esac
  done <<< "$simulation"
  [[ "$planned_target" == true ]] || fail 'Simulation did not select the exact HEX package. Nothing installed.'
  [[ $(state) == "$initial_state" ]] || fail 'Installed package state changed during review. Rerun only after checking it.'
  if [[ "$mode" == upgrade ]]; then verify_binary "$previous_binary"; fi
  require_closed
  printf '%s\n' "$simulation"
  printf '%s\n' 'Verified proposal: only HEX DEV may be upgraded; required missing dependencies may be installed.' 'Review the actual apt proposal. Decline if it differs. No unattended approval, repository refresh, unrelated upgrades or removals are requested.'
  printf '%s' 'Type INSTALL to approve this verified HEX proposal, or anything else to cancel: ' >/dev/tty
  answer=''; IFS= read -r answer </dev/tty || fail 'Approval was not received. Nothing installed.'
  [[ "$answer" == INSTALL ]] || fail 'Cancelled. Nothing installed.'
  [[ $(state) == "$initial_state" ]] || fail 'Installed HEX state changed during approval. Nothing installed.'
  if [[ "$mode" == upgrade ]]; then verify_binary "$previous_binary"; fi
  require_closed
  sudo env LC_ALL=C apt-get "${options[@]}" install "$pkg" </dev/tty
fi
[[ $(state) == "$expected_state" ]] || fail 'The exact HEX DEV version was not installed. Nothing launched.'
verify_binary "$expected_binary"
if [[ -z ${DISPLAY:-} && -z ${WAYLAND_DISPLAY:-} ]]; then
  printf '%s\n' 'Verified HEX DEV.4 is installed. Open XI-IO HEX DEV from your graphical desktop.'
  exit 0
fi
cleanup; download_dir=''
exec /usr/bin/xi-io-hex-dev
