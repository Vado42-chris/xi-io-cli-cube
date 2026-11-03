#!/usr/bin/env bash
# Release-process adapter, not a second installer: Debian/HEX own installation.
set -euo pipefail
test "$GITHUB_REPOSITORY" = "Vado42-chris/xi-io-cli-cube"
test "$(git rev-parse HEAD)" = "7ab90403678bcaaef73b2bf465915aa25b8acffd"
test "$(git rev-parse HEAD^{tree})" = "e4c526fb20e555720ae9b53be1934f12940d991a"
test "$(gh api "repos/$GITHUB_REPOSITORY/git/commits/14c66013b311f2a878f9ad5c76dd37d044be18f6" --jq .tree.sha)" = "e4c526fb20e555720ae9b53be1934f12940d991a"
root="$RUNNER_TEMP/xiio-local-first"
mkdir -p "$root/incoming" "$root/expanded" "$root/publish"
gh run download 40573821258 --repo "$GITHUB_REPOSITORY" --name hex-native-core-source-candidate --dir "$root/incoming"
(
 cd "$root/incoming"
 sha256sum -c SHA256SUMS
)
original="$root/incoming/XI-IO HEX DEV_0.1.0-dev.9_amd64.deb"
test -f "$original"
test "$(stat -c %s "$original")" = "6698412"
test "$(sha256sum "$original" | awk '{print $1}')" = "f9351779d73c34f13e6f1d70a24f33c887a2b1277dae5c79556a8c93b14f185c"
test "$(dpkg-deb -f "$original" Package)" = xi-io-hex-dev
test "$(dpkg-deb -f "$original" Version)" = 0.1.0-dev.9
test "$(dpkg-deb -f "$original" Architecture)" = amd64
grep -Fx "SOURCE_SHA=14c66013b311f2a878f9ad5c76dd37d044be18f6" "$root/incoming/QUALIFICATION.txt"
dpkg-deb -R "$original" "$root/expanded"
test "$(sha256sum "$root/expanded/usr/bin/xi-io-hex-dev" | awk '{print $1}')" = "05ea58005b9f3ecbf249d1a82a2cde9cac5ad37efdb5346c0ab2b68e1ba774b8"
for file in installer_adapter.py connection_profile.py child_bundle.py test_bundle.py; do
  test "$(git hash-object "$root/expanded/usr/lib/XI-IO HEX DEV/adapter/$file")" = "$(git rev-parse "HEAD:native/hex/adapter/$file")"
done
python3 - "$root/expanded/DEBIAN/control" <<'PY'
from pathlib import Path
import sys
f=Path(sys.argv[1]); s=f.read_text()
assert s.count("Version: 0.1.0-dev.9\n")==1
f.write_text(s.replace("Version: 0.1.0-dev.9\n","Version: 0.1.0-dev.9+xiio7ab90403\n"))
PY
pkg="$root/publish/xi-io-hex-dev_0.1.0-dev.9+xiio7ab90403_amd64.deb"
dpkg-deb --root-owner-group -b "$root/expanded" "$pkg"
test "$(dpkg-deb -f "$pkg" Version)" = "0.1.0-dev.9+xiio7ab90403"
test "$(dpkg-deb -f "$pkg" Architecture)" = amd64
dpkg --compare-versions 0.1.0-dev.9+xiio7ab90403 gt 0.1.0-dev.9
(cd "$root/publish" && sha256sum "$(basename "$pkg")" > SHA256SUMS && sha256sum -c SHA256SUMS)
cat > "$root/publish/INSTALL-LOCAL-FIRST.txt" <<'TXT'
XI-IO HEX local-first development prerelease
Source: 7ab90403678bcaaef73b2bf465915aa25b8acffd
Debian version: 0.1.0-dev.9+xiio7ab90403
Supported target: Linux amd64 with Debian package management

Download the .deb and SHA256SUMS from this GitHub release.
Open the .deb with your graphical Debian package installer and approve.
Open XI-IO HEX DEV, select Install on this computer, review the
existing local CLI plan and approve. Local features require no XI-IO
account, linked provider, device enrollment, Ward grant or remote server.
Preserve existing device records and user data on update.
The Loki server and any established tunnels are not touched.
Remote execution is NOT available until the independent sovereign XI-IO
session and Ward admission producers are genuinely active. This package
does not provision or grant remote authority; it is local-only.
TXT
python3 - "$root/publish" "$pkg" <<'PY'
import hashlib, json, pathlib, sys
d=pathlib.Path(sys.argv[1]); p=pathlib.Path(sys.argv[2])
body={"schema":"xiio.hex.local-first-release/v1",
"sourceCommit":"7ab90403678bcaaef73b2bf465915aa25b8acffd",
"sourceTree":"e4c526fb20e555720ae9b53be1934f12940d991a",
"originalCiRun":40573821258,"originalArtifactId":12766112293,
"originalDebSha256":"f9351779d73c34f13e6f1d70a24f33c887a2b1277dae5c79556a8c93b14f185c",
"binarySha256":"05ea58005b9f3ecbf249d1a82a2cde9cac5ad37efdb5346c0ab2b68e1ba774b8",
"newDebVersion":"0.1.0-dev.9+xiio7ab90403","newDebName":p.name,
"newDebBytes":p.stat().st_size,"newDebSha256":hashlib.sha256(p.read_bytes()).hexdigest(),
"change":"Debian control Version only; executable and adapter bytes unchanged",
"remoteConnected":False,"sessionVerified":False,"wardAdmitted":False}
(d/"PROVENANCE.json").write_text(json.dumps(body,indent=2)+"\n")
PY
echo "HEX_LOCAL_FIRST_ARTIFACT_STAGED"
