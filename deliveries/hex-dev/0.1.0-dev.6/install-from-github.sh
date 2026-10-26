#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C
[[ "$(id -u)" != 0 ]] || { echo "Run as your normal user, not root."; exit 1; }
[[ "$(uname -s)" == Linux && "$(dpkg --print-architecture)" == amd64 ]] || { echo "Linux amd64 required."; exit 1; }
for tool in curl sha256sum dpkg-deb dpkg dpkg-query apt-get pgrep awk mktemp; do command -v "$tool" >/dev/null || { echo "Missing requirement: $tool"; exit 1; }; done
if pgrep -x xi-io-hex-dev >/dev/null 2>&1; then
 echo "Close XI-IO HEX DEV first, then rerun. No process was stopped."; exit 1
else
 status=$?
 [[ "$status" == 1 ]] || { echo "Cannot establish whether HEX is running; stopped."; exit 1; }
fi
work="$(mktemp -d "${TMPDIR:-/tmp}/xiio-hex-dev6.XXXXXXXX")"
deb="$work/xi-io-hex-dev_0.1.0-dev.6_amd64.deb"
echo "Temporary download and apt review: $work"
curl --fail --location --proto '=https' --tlsv1.2 --output "$deb" 'https://raw.githubusercontent.com/Vado42-chris/xi-io-cli-cube/2b162224ab9ad0e1dbc128d41bdcd90ca16acac9/deliveries/hex-dev/0.1.0-dev.6/xi-io-hex-dev_0.1.0-dev.6_amd64.deb'
echo "7f2aa8af513adde056a687c98dd8e53fa27e78b27d75c7ead2ad582c8f5a85f3  $deb" | sha256sum --check -
[[ "$(dpkg-deb -f "$deb" Package)" == xi-io-hex-dev ]]
[[ "$(dpkg-deb -f "$deb" Version)" == 0.1.0-dev.6 ]]
[[ "$(dpkg-deb -f "$deb" Architecture)" == amd64 ]]
installed="$(dpkg-query -W -f='${Version}' xi-io-hex-dev 2>/dev/null || true)"
if [[ -n "$installed" ]] && dpkg --compare-versions "$installed" gt 0.1.0-dev.6; then echo "Refusing downgrade from $installed."; exit 1; fi
apt-get --simulate --no-remove install "$deb" >"$work/apt-plan.txt"
cat "$work/apt-plan.txt"
if grep -q '^Remv ' "$work/apt-plan.txt"; then echo "Refusing package removal."; exit 1; fi
if awk '/^(Inst|Conf) / && $2 != "xi-io-hex-dev" {found=1} END {exit !found}' "$work/apt-plan.txt"; then
 echo "Other packages would change. Stopped for separate review; nothing installed."; exit 1
fi
printf '\nThis installs/updates only XI-IO HEX DEV. It does NOT repair the CLI automatically.\nNo Node download, model move, service startup or CLI generation replacement.\n'
read -r -p 'Type INSTALL to proceed with the displayed package change: ' approval
[[ "$approval" == INSTALL ]] || { echo "Cancelled; nothing installed."; exit 1; }
sudo apt-get -o DPkg::Lock::Timeout=0 --no-remove install "$deb"
[[ "$(dpkg-query -W -f='${Version}' xi-io-hex-dev)" == 0.1.0-dev.6 ]]
echo "HEX DEV6 installed. Open XI-IO HEX DEV from your applications menu."
echo "Select Install, then Repair only the existing CLI launcher."
echo "Existing generation root: $HOME/.local/share/xi-io/cli-v1"
echo "Existing launcher directory: $HOME/.local/bin"
echo "Select your existing NVM Node executable; HEX verifies its actual identity."
echo "Review original/expected launcher SHA and approve only the repair plan."
echo "Then verify the real xi-io-cli version, doctor and approved local read."
echo "Installation is not CLI acceptance or a remote connection."
rm -rf -- "$work"

