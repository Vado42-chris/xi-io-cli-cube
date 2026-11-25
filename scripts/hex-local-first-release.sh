#!/usr/bin/env bash
# Existing #24 release-process adapter; Debian/HEX still own local installation.
set -euo pipefail
test "$GITHUB_REPOSITORY" = "Vado42-chris/xi-io-cli-cube"
test "$GITHUB_ACTIONS" = true
test "$RUNNER_ENVIRONMENT" = github-hosted
source_sha=d160521cffd3ff7e627155050faeecc693ac76bc
source_tree=376b0029bc5a265de15e08299684405ea6b064c1
qualified_head=a2657584cdc32058031d78e5d52867c48560724e
tested_merge=cd7716a1c40ca6b6fb7393fcedb8ae50f5a5a2b6
contract_run=45703669807
cli_run=45703669759
artifact_id=15064333656
artifact_name="hex-snap55-hosted-native-$tested_merge"
archive_bytes=6890396
archive_sha=94ccbcceb2a01f42c47942cfbe400c7799086018ae26876c2533a591b218e6ee
deb_bytes=6922042
deb_sha=07115547bd5603882eca5f2b31593615162e6ae1e1573c8b2a8635245337c700
binary_sha=ea5059196651e3100ee0f08393de09337859d72c34fc629fd2292f45d00f4b12
test "$XIIO_HEX_SOURCE_SHA" = "$source_sha"
test "$XIIO_HEX_RELEASE_TAG" = xiio-hex-local-d160521c-dev12
test "$XIIO_HEX_PACKAGE_NAME" = xi-io-hex-dev_0.1.0-dev.12_amd64.deb
test "$(git rev-parse HEAD)" = "$source_sha"
test "$(git rev-parse HEAD^{tree})" = "$source_tree"
for commit in "$source_sha" "$qualified_head" "$tested_merge"; do
  test "$(gh api "repos/$GITHUB_REPOSITORY/git/commits/$commit" --jq .tree.sha)" = "$source_tree"
done
test "$(gh api "repos/$GITHUB_REPOSITORY/compare/$source_sha...main" --jq .merge_base_commit.sha)" = "$source_sha"
# Bind successful current run attempts to the qualified PR source and workflows.
root="$RUNNER_TEMP/xiio-local-first"
test ! -e "$root"
mkdir -m 0700 -p "$root/incoming" "$root/expanded" "$root/publish"
for record in "$contract_run:.github/workflows/installer-contract.yml" "$cli_run:.github/workflows/cli-payload-current.yml"; do
  run_id="${record%%:*}"; workflow="${record#*:}"
  gh api "repos/$GITHUB_REPOSITORY/actions/runs/$run_id" > "$root/run-$run_id.json"
  jq -e --argjson id "$run_id" --arg head "$qualified_head" --arg workflow "$workflow" \
    '.id == $id and .head_sha == $head and .path == $workflow and .event == "pull_request"
     and .run_attempt == 1 and .status == "completed" and .conclusion == "success"' \
    "$root/run-$run_id.json"
done
gh api "repos/$GITHUB_REPOSITORY/actions/runs/$contract_run/jobs?filter=latest&per_page=100" > "$root/contract-jobs.json"
jq -e '
  .total_count == 7 and (.jobs | length) == 7
  and all(.jobs[]; .status == "completed" and .conclusion == "success")
  and ([.jobs[] | select(.name == "maths-installed-window")
        | .steps[] | select(.name == "Build exact-source Tauri and Debian, no DEV9 carrier fallback"
          and .status == "completed" and .conclusion == "success")] | length) == 1
  and ([.jobs[] | select(.name == "maths-installed-window")
        | .steps[] | select(.name == "Install actual candidate on disposable Linux and observe running window"
          and .status == "completed" and .conclusion == "success")] | length) == 1' \
  "$root/contract-jobs.json"
gh api "repos/$GITHUB_REPOSITORY/actions/artifacts/$artifact_id" > "$root/artifact.json"
jq -e --argjson id "$artifact_id" --arg name "$artifact_name" --argjson bytes "$archive_bytes" \
  --arg digest "sha256:$archive_sha" --argjson run "$contract_run" --arg head "$qualified_head" \
  '.id == $id and .name == $name and .size_in_bytes == $bytes and .digest == $digest
   and .expired == false and .workflow_run.id == $run and .workflow_run.head_sha == $head' \
  "$root/artifact.json"
gh api "repos/$GITHUB_REPOSITORY/actions/artifacts/$artifact_id/zip" > "$root/artifact.zip"
test "$(stat -c %s "$root/artifact.zip")" = "$archive_bytes"
test "$(sha256sum "$root/artifact.zip" | awk '{print $1}')" = "$archive_sha"
unzip -q "$root/artifact.zip" -d "$root/incoming"
original="$root/incoming/native/hex/carrier/src-tauri/target/release/bundle/deb/XI-IO HEX DEV_0.1.0-dev.12_amd64.deb"
test -f "$original"
test "$(stat -c %s "$original")" = "$deb_bytes"
test "$(sha256sum "$original" | awk '{print $1}')" = "$deb_sha"
test "$(dpkg-deb -f "$original" Package)" = xi-io-hex-dev
test "$(dpkg-deb -f "$original" Version)" = 0.1.0-dev.12
test "$(dpkg-deb -f "$original" Architecture)" = amd64
dpkg-deb -x "$original" "$root/expanded"
test "$(sha256sum "$root/expanded/usr/bin/xi-io-hex-dev" | awk '{print $1}')" = "$binary_sha"
# Reopen every packaged adapter/CLI source file against accepted source blobs.
python3 - "$root/expanded/usr/lib/XI-IO HEX DEV" <<'PY'
import hashlib, pathlib, subprocess, sys
bundle=pathlib.Path(sys.argv[1])
raw=subprocess.check_output(["git","ls-tree","-r","-z","HEAD","native/hex/adapter","native/hex/cli-source"])
expected={}
for row in raw.split(b"\0"):
    if not row: continue
    metadata,name=row.split(b"\t",1)
    mode,kind,sha=metadata.decode().split()
    if kind=="blob": expected[name.decode()]=sha
count=0
for directory in ("adapter","cli-source"):
    for path in sorted((bundle/directory).rglob("*")):
        if path.is_symlink(): raise SystemExit("PACKAGED_SOURCE_SYMLINK_REFUSED")
        if not path.is_file(): continue
        relative="native/hex/"+path.relative_to(bundle).as_posix()
        body=path.read_bytes()
        actual=hashlib.sha1(b"blob "+str(len(body)).encode()+b"\0"+body).hexdigest()
        if expected.get(relative)!=actual: raise SystemExit("PACKAGED_SOURCE_BLOB_MISMATCH: "+relative)
        count+=1
if count!=113: raise SystemExit("PACKAGED_SOURCE_COUNT_MISMATCH")
print("PACKAGED_SOURCE_READBACK=113/113")
PY
# Source already identifies DEV12. Normalize only the filename, never CONTROL.
pkg="$root/publish/$XIIO_HEX_PACKAGE_NAME"
cp -- "$original" "$pkg"
cmp -- "$original" "$pkg"
(cd "$root/publish" && sha256sum "$XIIO_HEX_PACKAGE_NAME" > SHA256SUMS && sha256sum -c SHA256SUMS)
url="https://github.com/$GITHUB_REPOSITORY/releases/download/$XIIO_HEX_RELEASE_TAG"
cat > "$root/publish/INSTALL-LOCAL-FIRST.txt" <<TXT
XI-IO HEX local-first Linux DEV12 prerelease
Accepted source: $source_sha
Source tree: $source_tree
Qualified PR head: $qualified_head
Tested merge: $tested_merge
Package: $XIIO_HEX_PACKAGE_NAME
SHA-256: $deb_sha

Download, verify, install and open from your Pop!_OS terminal.
Paste this complete block; any failed step stops before the next one:
(
set -e
curl --fail --location --proto '=https' --proto-redir '=https' --tlsv1.2 --output "$XIIO_HEX_PACKAGE_NAME" "$url/$XIIO_HEX_PACKAGE_NAME"
curl --fail --location --proto '=https' --proto-redir '=https' --tlsv1.2 --output SHA256SUMS "$url/SHA256SUMS"
sha256sum --check SHA256SUMS
sudo apt install --no-remove "./$XIIO_HEX_PACKAGE_NAME"
xi-io-hex-dev
)

No GitHub account, XI-IO sign-in, enrollment, Ward grant, tunnel or ChatGPT
connection is required for this local download, installation or first launch.
The package declares Python 3.10+, bash, GTK3 and WebKitGTK4.1 dependencies.
The existing local CLI setup separately reviews your chosen Node 22.13+ runtime,
installation target and packaged CLI plan. Installing the HEX package alone does
not replace an existing CLI generation or reset device records and user data.

Evidence: pinned current CI installed these exact package bytes on disposable
Ubuntu and observed a process-owned visible native window. The captured image
does not establish rendered-content or action success. Pop!_OS first use and
local-action acceptance remain pending. This is a local development prerelease,
not managed-upgrade, remote-execution or installed-product qualification.
TXT
python3 - "$root/publish" "$pkg" <<'PY'
import hashlib, json, pathlib, sys
directory=pathlib.Path(sys.argv[1]); package=pathlib.Path(sys.argv[2])
body={
 "schema":"xiio.hex.local-first-release/v1",
 "sourceCommit":"d160521cffd3ff7e627155050faeecc693ac76bc",
 "sourceTree":"376b0029bc5a265de15e08299684405ea6b064c1",
 "qualifiedPrHead":"a2657584cdc32058031d78e5d52867c48560724e",
 "testedMerge":"cd7716a1c40ca6b6fb7393fcedb8ae50f5a5a2b6",
 "originalCiRun":45703669807,"cliQualificationRun":45703669759,"runAttempts":1,
 "originalArtifactId":15064333656,
 "originalArtifactName":"hex-snap55-hosted-native-cd7716a1c40ca6b6fb7393fcedb8ae50f5a5a2b6",
 "artifactZipBytes":6890396,
 "artifactZipSha256":"94ccbcceb2a01f42c47942cfbe400c7799086018ae26876c2533a591b218e6ee",
 "originalDebSha256":"07115547bd5603882eca5f2b31593615162e6ae1e1573c8b2a8635245337c700",
 "binarySha256":"ea5059196651e3100ee0f08393de09337859d72c34fc629fd2292f45d00f4b12",
 "newDebVersion":"0.1.0-dev.12","newDebName":package.name,
 "newDebBytes":package.stat().st_size,"newDebSha256":hashlib.sha256(package.read_bytes()).hexdigest(),
 "change":"Filename normalization only; package bytes unchanged from verified CI artifact",
 "packagedSourceReadback":113,"hostedProcessOwnedVisibleWindowObserved":True,
 "renderedContentOrActionVerified":False,"poposFirstUseVerified":False,
 "managedUpgradeQualified":False,"remoteConnected":False,"sessionVerified":False,"wardAdmitted":False
}
(directory/"PROVENANCE.json").write_text(json.dumps(body,indent=2)+"\n")
PY
printf '%s\n' "HEX_LOCAL_FIRST_DEV12_ARTIFACT_STAGED" \
  "POPOS_FIRST_USE=NOT_RUN" "RENDERED_CONTENT_OR_ACTION=NOT_VERIFIED" \
  "MANAGED_UPGRADE=NOT_QUALIFIED"
