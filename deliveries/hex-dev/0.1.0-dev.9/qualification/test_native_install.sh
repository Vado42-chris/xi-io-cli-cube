#!/usr/bin/env bash
# XI-IO HEX DEV9: isolated Linux DEB install/readback/removal qualification.
# Operates ONLY on an ephemeral CI runner. Never run on an owner workstation.
set -euo pipefail
umask 077
export DEBIAN_FRONTEND=noninteractive

[[ "${GITHUB_ACTIONS:-}" == true && "${RUNNER_ENVIRONMENT:-}" == github-hosted ]] || {
  echo 'CI_EPHEMERAL_RUNNER_REQUIRED'; exit 78;
}
[[ "$(id -u)" != 0 && "$(uname -s)" == Linux && "$(dpkg --print-architecture)" == amd64 ]] || {
  echo 'CI_LINUX_AMD64_UNPRIVILEGED_RUNNER_REQUIRED'; exit 78;
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd -P)"
# This test resides at deliveries/hex-dev/0.1.0-dev.9/qualification/.
deb="$repo_root/deliveries/hex-dev/0.1.0-dev.9/xi-io-hex-dev_0.1.0-dev.9_amd64.deb"
expected_sha='87d367490c02c9627216156441d832ea6f39840979dae51cc08a23b2684fdf11'
expected_size=6672978
[[ -f "$deb" && ! -L "$deb" && "$(stat -c %s "$deb")" == "$expected_size" ]] || {
  echo 'EXACT_DEV9_ARTIFACT_MISSING_OR_SIZE_MISMATCH'; exit 1;
}
printf '%s  %s\n' "$expected_sha" "$deb" | sha256sum --check --status || {
  echo 'EXACT_DEV9_ARTIFACT_DIGEST_MISMATCH'; exit 1;
}
[[ "$(dpkg-deb -f "$deb" Package)" == xi-io-hex-dev \
  && "$(dpkg-deb -f "$deb" Version)" == 0.1.0-dev.9 \
  && "$(dpkg-deb -f "$deb" Architecture)" == amd64 ]] || {
  echo 'EXACT_DEV9_PACKAGE_IDENTITY_MISMATCH'; exit 1;
}

scratch="$(mktemp -d -t xiio-dev9-installed-XXXXXXXX)"
trap 'rm -rf -- "$scratch"' EXIT
# Verify the package itself does not run maintainer hooks as root.
mkdir "$scratch/control"
dpkg-deb -e "$deb" "$scratch/control"
for maint in preinst postinst prerm postrm config; do
  if [[ -e "$scratch/control/$maint" ]]; then
    echo "UNREVIEWED_MAINTAINER_HOOK:$maint"; exit 1
  fi
done
if dpkg-query -W -f='${db:Status-Abbrev}' xi-io-hex-dev 2>/dev/null | grep -q '^ii'; then
  echo 'RUNNER_PACKAGE_NOT_CLEAN'; exit 1
fi

# This runs on a disposable hosted Linux image only. No owner host is touched.
sudo apt-get update -qq
apt-get --simulate --no-remove install "$deb" > "$scratch/apt-plan.txt"
if grep -q '^Remv ' "$scratch/apt-plan.txt"; then
  echo 'APT_PLAN_WOULD_REMOVE_EXISTING_PACKAGES'; exit 1
fi
sudo apt-get -y --no-remove install "$deb" > "$scratch/apt-install.log" 2>&1 || {
  cat "$scratch/apt-install.log"; echo 'NATIVE_DEB_INSTALL_FAILED'; exit 1
}
state="$(dpkg-query -W -f='${Version} ${Status}' xi-io-hex-dev)"
[[ "$state" == '0.1.0-dev.9 install ok installed' ]] || {
  echo "PACKAGE_STATE_INCOMPLETE:$state"; exit 1
}
installed_files="$(dpkg -L xi-io-hex-dev)"
printf '%s\n' "$installed_files" > "$scratch/installed-files.txt"
# Verify the actual installed, packaged adapter and native client bytes.
bundle='/usr/lib/XI-IO HEX DEV'
for item in 'adapter/installer_adapter.py' 'adapter/kernel/xiio_installer/transaction.py' \
  'cli-source/packaged-source.json' 'cli-source/connection/scripts/device-native-consumer.mjs'; do
  [[ -f "$bundle/$item" ]] || { echo "INSTALLED_FILE_MISSING:$item"; exit 1; }
done
[[ -z "$(sudo dpkg --verify xi-io-hex-dev)" ]] || {
  echo 'INSTALLED_DEB_BYTES_DIVERGED'; exit 1
}
node --check "$bundle/cli-source/connection/scripts/device-native-consumer.mjs"
python3 -I - "$bundle/adapter/installer_adapter.py" <<'PY'
import ast, pathlib, sys
ast.parse(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'))
PY
# Source-only native component presence does NOT constitute an authority binding.
printf '%s\n' 'NATIVE_DEB_INSTALLED_AND_REOPENED_PASS' \
  'AUTHORITY_BINDINGS=UNVERIFIED' 'REMOTE_CONNECTION=NOT_TESTED' \
  'CHILD_PRODUCTS_NOT_AUTOPROVISIONED'

# Removal is tested only inside this throwaway CI VM.
sudo apt-get -y remove xi-io-hex-dev > "$scratch/apt-remove.log" 2>&1 || {
  cat "$scratch/apt-remove.log"; echo 'NATIVE_DEB_REMOVE_FAILED'; exit 1
}
[[ ! -f "$bundle/adapter/installer_adapter.py" ]] || {
  echo 'PACKAGE_REMOVAL_LEFT_EXECUTABLE_PAYLOAD'; exit 1
}
[[ "$(dpkg-query -W -f='${db:Status-Abbrev}' xi-io-hex-dev 2>/dev/null || true)" != ii* ]] || {
  echo 'PACKAGE_STILL_INSTALLED_AFTER_REMOVAL'; exit 1
}
echo 'NATIVE_DEB_INSTALL_READBACK_REMOVE_PASS'
