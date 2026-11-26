#!/usr/bin/env bash
# Existing #24 release-process adapter; Debian/HEX still own local installation.
set -euo pipefail
test "$GITHUB_REPOSITORY" = "Vado42-chris/xi-io-cli-cube"
test "$GITHUB_ACTIONS" = true
test "$RUNNER_ENVIRONMENT" = github-hosted
# Candidate only. Bind every release-selection value to the actual successful
# Artcraft run and independently reopened accepted source before activation.
# Legacy Library receipts cannot qualify this Artcraft package. All unbound
# identity guards run before any provider lookup.
source_sha=cbf89ae2cee92c894baa0064eb24092ffaf17f7c
source_tree=7c28ed503af9d5900a9d5adf5f37d85f0b87772d
qualified_head=5fd1932b910e4bea79b40f12fc2c86904ae28f57
tested_merge=8abe8f01a3d83006cdbf83d84d2a72ee6b429b8c
contract_run=45793530336
contract_attempt=1
cli_run=45793530320
cli_attempt=1
artifact_id=15104589147
artifact_name="hex-snap55-hosted-native-$tested_merge"
archive_bytes=25996138
archive_sha=138470a7f351eb5c4227a9146bbfb4d0918377ce3da8cb1a4d5791bdcc895849
deb_bytes=10927790
deb_sha=df93d5d01cfcbea76515428fb79c00384d556f8b403c481fd6e7eeccbd3fc88b
binary_sha=bfac6ba6b59d87e44dda357df45d4c3d03431752735a0d960ce0e95b9c8b5760
embedded_cli=f2626cae872f191e980ecdfb681485f2d9e67198
for identity in source_sha source_tree qualified_head tested_merge embedded_cli; do
  [[ "${!identity}" =~ ^[a-f0-9]{40}$ ]] || { printf 'HEX_RELEASE_INPUT_UNBOUND:%s\n' "$identity" >&2; exit 78; }
done
for identity in archive_sha deb_sha binary_sha; do
  [[ "${!identity}" =~ ^[a-f0-9]{64}$ ]] || { printf 'HEX_RELEASE_INPUT_UNBOUND:%s\n' "$identity" >&2; exit 78; }
done
for identity in contract_run contract_attempt cli_run cli_attempt artifact_id archive_bytes deb_bytes; do
  [[ "${!identity}" =~ ^[1-9][0-9]*$ ]] || { printf 'HEX_RELEASE_INPUT_UNBOUND:%s\n' "$identity" >&2; exit 78; }
done
test "$XIIO_HEX_SOURCE_SHA" = "$source_sha"
test "$XIIO_HEX_RELEASE_TAG" = "xiio-hex-local-${source_sha:0:8}-dev13"
test "$XIIO_HEX_PACKAGE_NAME" = xi-io-hex-dev_0.1.0-dev.13_amd64.deb
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
for record in "$contract_run:$contract_attempt:.github/workflows/installer-contract.yml" "$cli_run:$cli_attempt:.github/workflows/cli-payload-current.yml"; do
  run_id="${record%%:*}"; remaining="${record#*:}"
  attempt="${remaining%%:*}"; workflow="${remaining#*:}"
  gh api "repos/$GITHUB_REPOSITORY/actions/runs/$run_id" > "$root/run-$run_id.json"
  jq -e --argjson id "$run_id" --argjson attempt "$attempt" --arg head "$qualified_head" --arg workflow "$workflow" \
    '.id == $id and .head_sha == $head and .path == $workflow and .event == "pull_request"
     and .run_attempt == $attempt and .status == "completed" and .conclusion == "success"' \
    "$root/run-$run_id.json"
done
gh api "repos/$GITHUB_REPOSITORY/actions/runs/$contract_run/jobs?filter=latest&per_page=100" > "$root/contract-jobs.json"
jq -e '
  .total_count == 7 and (.jobs | length) == 7
  and all(.jobs[]; .status == "completed" and .conclusion == "success")
  and ([.jobs[] | select(.name == "maths-installed-window")
        | .steps[] | select(.name == "Build and stage the existing hosted-canvas runtime"
          and .status == "completed" and .conclusion == "success")] | length) == 1
  and ([.jobs[] | select(.name == "maths-installed-window")
        | .steps[] | select(.name == "Build exact-source Tauri and Debian, no DEV9 carrier fallback"
          and .status == "completed" and .conclusion == "success")] | length) == 1
  and ([.jobs[] | select(.name == "maths-installed-window")
        | .steps[] | select(.name == "Install actual candidate on disposable Linux and observe running window"
          and .status == "completed" and .conclusion == "success")] | length) == 1
  and ([.jobs[] | select(.name == "maths-installed-window")
        | .steps[] | select(.name == "Retain the actual frontend consumed by this native package"
          and .status == "completed" and .conclusion == "success")] | length) == 1
  and ([.jobs[] | select(.name == "maths-installed-window")
        | .steps[] | select(.name == "Refuse the actual released DEV12 catalog with the same content observer"
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
original="$root/incoming/native/hex/carrier/src-tauri/target/release/bundle/deb/XI-IO HEX DEV_0.1.0-dev.13_amd64.deb"
test -f "$original"
test "$(stat -c %s "$original")" = "$deb_bytes"
test "$(sha256sum "$original" | awk '{print $1}')" = "$deb_sha"
test "$(dpkg-deb -f "$original" Package)" = xi-io-hex-dev
test "$(dpkg-deb -f "$original" Version)" = 0.1.0-dev.13
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
# Source already identifies DEV13. Normalize only the filename, never CONTROL.
pkg="$root/publish/$XIIO_HEX_PACKAGE_NAME"
cp -- "$original" "$pkg"
cmp -- "$original" "$pkg"
(cd "$root/publish" && sha256sum "$XIIO_HEX_PACKAGE_NAME" > SHA256SUMS && sha256sum -c SHA256SUMS)
/usr/bin/python3 -I -B - "$root/publish" "$pkg" "$root/incoming" \
  "$source_sha" "$source_tree" "$qualified_head" "$tested_merge" \
  "$contract_run" "$contract_attempt" "$cli_run" "$cli_attempt" \
  "$artifact_id" "$artifact_name" "$archive_bytes" "$archive_sha" \
  "$deb_sha" "$binary_sha" "$embedded_cli" "$GITHUB_REPOSITORY" <<'PY'
import hashlib, importlib.util, json, os, pathlib, re, subprocess, sys, tarfile, tempfile, zipfile
from PIL import Image
(directory,package,incoming,source,tree,head,merge,run,attempt,cli_run,cli_attempt,
 artifact_id,artifact_name,archive_bytes,archive_sha,deb_sha,elf_sha,embedded_cli,repository)=sys.argv[1:]
directory,package,incoming=map(pathlib.Path,(directory,package,incoming))
def require(value,code):
    if not value: raise SystemExit(code)
def file_identity(path):
    require(path.is_file() and not any(p.is_symlink() for p in [path,*path.parents]),
            'NATIVE_EVIDENCE_FILE_UNAVAILABLE:'+path.name)
    h=hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''):h.update(chunk)
    return {'file':path.name,'bytes':path.stat().st_size,'sha256':h.hexdigest()}
def read_receipt(name):
    path=incoming/name
    identity=file_identity(path)
    require(identity['bytes'] <= 1024*1024,'NATIVE_RECEIPT_OVER_BUDGET:'+name)
    raw=path.read_bytes()
    require(len(raw)==identity['bytes'] and hashlib.sha256(raw).hexdigest()==identity['sha256'],
            'NATIVE_RECEIPT_CHANGED:'+name)
    text=raw.decode('utf-8')
    receipt=json.loads(text)
    require(isinstance(receipt,dict),'NATIVE_RECEIPT_NOT_OBJECT:'+name)
    # Preserve the original UTF-8, not only a reserialized interpretation.
    return {**identity,'receipt':receipt,'originalUtf8':text}
def require_false(receipt,fields,code):
    require(all(receipt.get(field) is False for field in fields),code)
def accepted_blob(relative):
    path=pathlib.Path(relative)
    require(path.is_file() and not any(p.is_symlink() for p in [path,*path.parents]),
            'ACCEPTED_SOURCE_UNAVAILABLE:'+relative)
    raw=path.read_bytes()
    actual=hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
    expected=subprocess.check_output(['git','rev-parse','HEAD:'+relative],text=True).strip()
    require(actual==expected,'ACCEPTED_SOURCE_CHANGED:'+relative)
    return expected
def load_accepted_module(relative,name):
    accepted_blob(relative)
    spec=importlib.util.spec_from_file_location(name,pathlib.Path(relative).absolute())
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def verify_ocr_toolchain():
    wrapper=read_receipt('hex-ocr-identity.json')
    identity=wrapper['receipt']
    require(identity.get('schema')=='xiio.hex.ocr-toolchain/v1'
            and identity.get('source_commit')==merge and identity.get('source_tree')==tree
            and identity.get('github_run_id')==run and identity.get('github_run_attempt')==attempt,
            'OCR_TOOLCHAIN_SOURCE_RUN_MISMATCH')
    pins={
        'tesseract_source_commit':'64eab6c457b2337dd690746a5fde5c222b40d5f8',
        'leptonica_source_commit':'7e803e73511fbd320f01314c141d35d2b8491dde',
        'language_source_commit':'87416418657359cb625c412a48b6e1d6d41c29bd'}
    require(all(identity.get(key)==value for key,value in pins.items()),'OCR_TOOLCHAIN_SOURCE_PIN_MISMATCH')
    version=identity.get('version_full')
    require(identity.get('version_first_line')=='tesseract 5.5.0'
            and isinstance(version,str) and 0<len(version.encode('utf-8'))<=8192
            and version.splitlines()[0]==identity['version_first_line'] and version.endswith('\n')
            and 'leptonica-1.84.1' in version and '\0' not in version,'OCR_TOOLCHAIN_VERSION_MISMATCH')
    require(identity.get('static_ocr_libraries') is True and identity.get('supported_input')=='PNG',
            'OCR_TOOLCHAIN_INPUT_OR_LINKAGE_UNVERIFIED')
    require_false(identity,('provider_effect','pop_os_acceptance'),'OCR_TOOLCHAIN_SCOPE_INFLATED')
    expected={}
    def member(row,path_key,archive_path):
        require(isinstance(row,dict) and isinstance(row.get(path_key),str)
                and pathlib.PurePosixPath(row[path_key]).is_absolute()
                and '..' not in pathlib.PurePosixPath(row[path_key]).parts
                and '\0' not in row[path_key],'OCR_TOOLCHAIN_ORIGINAL_PATH_INVALID')
        require(row.get('archive_path')==archive_path and archive_path not in expected
                and type(row.get('bytes')) is int and 0<row['bytes']<=128*1024*1024
                and isinstance(row.get('sha256'),str)
                and re.fullmatch(r'[a-f0-9]{64}',row['sha256']) is not None,
                'OCR_TOOLCHAIN_MEMBER_IDENTITY_INVALID')
        expected[archive_path]={'bytes':row['bytes'],'sha256':row['sha256']}
    executable=identity.get('executable')
    language=identity.get('language')
    member(executable,'path','bin/tesseract')
    member(language,'path','share/tessdata/eng.traineddata')
    require(pathlib.PurePosixPath(executable['path']).name=='tesseract'
            and pathlib.PurePosixPath(language['path']).name=='eng.traineddata'
            and language.get('git_blob')=='bbef4675053b5b468cdb477053e28b1c698ba08e'
            and language['sha256']=='7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2',
            'OCR_TOOLCHAIN_LANGUAGE_PIN_MISMATCH')
    runtime=identity.get('runtime_files')
    require(isinstance(runtime,list) and 1<=len(runtime)<=32,'OCR_TOOLCHAIN_RUNTIME_DENOMINATOR_INVALID')
    runtime_paths=set()
    for row in runtime:
        require(isinstance(row,dict) and isinstance(row.get('resolved_path'),str)
                and isinstance(row.get('sha256'),str),'OCR_TOOLCHAIN_RUNTIME_MEMBER_INVALID')
        path=pathlib.PurePosixPath(row['resolved_path'])
        require(re.fullmatch(r'[A-Za-z0-9_.+-]+',path.name) is not None
                and row['resolved_path'] not in runtime_paths,'OCR_TOOLCHAIN_RUNTIME_PATH_INVALID')
        runtime_paths.add(row['resolved_path'])
        member(row,'resolved_path','runtime/'+row['sha256']+'-'+path.name)
        require(re.match(r'^lib(?:tesseract|lept)(?:[-.]|$)',path.name) is None,
                'OCR_TOOLCHAIN_DYNAMIC_OCR_LIBRARY_REFUSED')
    packages=identity.get('runtime_packages')
    require(isinstance(packages,list) and 1<=len(packages)<=len(runtime),
            'OCR_TOOLCHAIN_PACKAGE_DENOMINATOR_INVALID')
    package_names=set()
    for row in packages:
        require(isinstance(row,dict) and set(row)=={'name','version','copyright'}
                and isinstance(row.get('name'),str)
                and re.fullmatch(r'[a-z0-9][a-z0-9+.-]*(?::[a-z0-9-]+)?',row['name']) is not None
                and row['name'] not in package_names
                and isinstance(row.get('version'),str) and 0<len(row['version'])<=256
                and not any(char in row['version'] for char in ('\0','\n','\r')),
                'OCR_TOOLCHAIN_PACKAGE_RECORD_INVALID')
        package_names.add(row['name'])
        record=row['copyright']
        name='copyright/'+row['name'].replace(':','_')+'-copyright'
        require(isinstance(record,dict) and set(record)=={'archive_path','bytes','sha256'}
                and record.get('archive_path')==name and name not in expected
                and type(record.get('bytes')) is int and 0<record['bytes']<=1024*1024
                and isinstance(record.get('sha256'),str)
                and re.fullmatch(r'[a-f0-9]{64}',record['sha256']) is not None,
                'OCR_TOOLCHAIN_COPYRIGHT_IDENTITY_INVALID')
        expected[name]={key:record[key] for key in ('bytes','sha256')}
    # These are the license bytes in the three pinned upstream source commits.
    expected.update({
        'licenses/Tesseract-LICENSE':{'bytes':11358,'sha256':'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30'},
        'licenses/Leptonica-LICENSE':{'bytes':1521,'sha256':'87829abb5bbb00b55a107365da89e9a33f86c4250169e5a1e5588505be7d5806'},
        'licenses/Tessdata-LICENSE':{'bytes':11358,'sha256':'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30'}})
    for name,value in (('source-pins.json',pins),('runtime-packages.json',packages)):
        raw=(json.dumps(value,sort_keys=True,indent=2)+'\n').encode('utf-8')
        expected[name]={'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
    archive_record=identity.get('archive')
    archive_identity=file_identity(incoming/'hex-ocr-toolchain.tgz')
    require(isinstance(archive_record,dict) and archive_record==archive_identity
            and 0<archive_identity['bytes']<=256*1024*1024,'OCR_TOOLCHAIN_ARCHIVE_IDENTITY_MISMATCH')
    require(sum(row['bytes'] for row in expected.values())<=512*1024*1024,
            'OCR_TOOLCHAIN_ARCHIVE_EXPANSION_BOUNDS')
    directories={'.'}
    for name in expected:
        directories.update(str(parent) for parent in pathlib.PurePosixPath(name).parents)
    actual={}
    executable_bytes=None
    with tarfile.open(incoming/'hex-ocr-toolchain.tgz','r:gz') as archive:
        for entry in archive:
            path=pathlib.PurePosixPath(entry.name)
            require(not path.is_absolute() and '..' not in path.parts,'OCR_TOOLCHAIN_ARCHIVE_PATH_INVALID')
            name=str(path)
            if entry.isdir():
                require(name in directories,'OCR_TOOLCHAIN_ARCHIVE_EXTRA_DIRECTORY')
                continue
            require(entry.isfile() and name in expected and name not in actual
                    and entry.size==expected[name]['bytes'],'OCR_TOOLCHAIN_ARCHIVE_MEMBER_INVALID')
            with archive.extractfile(entry) as stream:
                raw=stream.read(expected[name]['bytes']+1)
            require(len(raw)==expected[name]['bytes']
                    and hashlib.sha256(raw).hexdigest()==expected[name]['sha256'],
                    'OCR_TOOLCHAIN_ARCHIVE_MEMBER_MISMATCH')
            if name=='share/tessdata/eng.traineddata':
                require(hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()==language['git_blob'],
                        'OCR_TOOLCHAIN_LANGUAGE_BLOB_MISMATCH')
            elif name=='bin/tesseract' or name.startswith('runtime/'):
                require(raw[:4]==b'\x7fELF','OCR_TOOLCHAIN_RUNTIME_NOT_ELF')
            if name=='bin/tesseract':executable_bytes=raw
            actual[name]={'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
    require(actual==expected and executable_bytes is not None,'OCR_TOOLCHAIN_ARCHIVE_FILES_MISMATCH')
    # Inspect ELF metadata without executing the retained OCR binary.
    try:
        with tempfile.TemporaryDirectory(prefix='hex-ocr-elf-readback-') as temporary:
            executable_path=pathlib.Path(temporary)/'tesseract'
            with executable_path.open('xb') as stream:stream.write(executable_bytes)
            result=subprocess.run(['/usr/bin/readelf','--dynamic','--wide',str(executable_path)],
                                  check=True,capture_output=True,text=True,timeout=15,
                                  env={**os.environ,'LC_ALL':'C'})
    except (OSError,subprocess.SubprocessError):
        raise SystemExit('OCR_TOOLCHAIN_ELF_READBACK_UNVERIFIED') from None
    require(len(result.stdout)<=1024*1024,'OCR_TOOLCHAIN_ELF_READBACK_BOUNDS')
    dynamic_needed=[]
    for line in result.stdout.splitlines():
        if '(NEEDED)' not in line:continue
        match=re.search(r'\(NEEDED\).*Shared library: \[([A-Za-z0-9_.+-]+)\]',line)
        require(match is not None,'OCR_TOOLCHAIN_ELF_NEEDED_UNVERIFIED')
        dynamic_needed.append(match.group(1))
    require(len(dynamic_needed)==len(set(dynamic_needed))
            and all(re.match(r'^lib(?:tesseract|lept)(?:[-.]|$)',name) is None for name in dynamic_needed),
            'OCR_TOOLCHAIN_STATIC_OCR_LINKAGE_MISMATCH')
    require(file_identity(incoming/'hex-ocr-identity.json')=={k:wrapper[k] for k in ('file','bytes','sha256')}
            and file_identity(incoming/'hex-ocr-toolchain.tgz')==archive_identity,'OCR_TOOLCHAIN_EVIDENCE_CHANGED')
    return {'identity':wrapper,'archive':archive_identity,'archiveMembers':actual,
            'executableDynamicNeeded':dynamic_needed}

def verify_ocr_binding(reading):
    binding=reading.get('ocr_toolchain')
    wrapper=ocr_toolchain['identity']
    require(isinstance(binding,dict) and set(binding)=={'identity_file','identity_sha256','identity'}
            and binding.get('identity_file')==wrapper['file']
            and binding.get('identity_sha256')==wrapper['sha256']
            and binding.get('identity')==wrapper['receipt'],'OCR_TOOLCHAIN_READBACK_BINDING_MISMATCH')
    require(reading.get('backend_version')==wrapper['receipt']['version_first_line']
            and isinstance(reading.get('layout_pass'),dict)
            and reading['layout_pass'].get('backend_version')==wrapper['receipt']['version_first_line'],
            'OCR_TOOLCHAIN_RENDERED_VERSION_MISMATCH')

def verify_rendered_readback(receipt,prefix,retired=False):
    reading=receipt.get('rendered_text_readback')
    require(isinstance(reading,dict) and reading.get('schema')=='xiio.hex.rendered-artcraft-text/v2'
            and reading.get('content_verified') is True,'RENDERED_TEXT_READBACK_UNVERIFIED')
    verify_ocr_binding(reading)
    require(reading.get('observation_mode')==('retired-dev12' if retired else 'candidate')
            and reading.get('backend')=='tesseract' and reading.get('language')=='eng'
            and type(reading.get('page_segmentation_mode')) is int and reading['page_segmentation_mode']==11
            and isinstance(reading.get('backend_version'),str)
            and reading['backend_version'].startswith('tesseract ')
            and len(reading['backend_version'])<=256,'RENDERED_TEXT_BACKEND_MISMATCH')
    screenshot=incoming/(prefix+'.png')
    crop=incoming/(prefix+'-owned-window.png')
    text_path=incoming/(prefix+'-owned-window.ocr.txt')
    image_identity=file_identity(screenshot)
    crop_identity=file_identity(crop)
    text_identity=file_identity(text_path)
    require(reading.get('screenshot_file')==screenshot.name
            and reading.get('screenshot_sha256')==receipt.get('screenshot_sha256')==image_identity['sha256']
            and reading.get('crop_file')==crop.name and reading.get('crop_sha256')==crop_identity['sha256'],
            'RENDERED_IMAGE_IDENTITY_MISMATCH')
    require(reading.get('raw_text_file')==text_path.name
            and reading.get('raw_text_sha256')==text_identity['sha256']
            and type(reading.get('raw_text_bytes')) is int
            and reading['raw_text_bytes']==text_identity['bytes']
            and text_identity['bytes']<=observer.OCR_MAX_BYTES,'RENDERED_TEXT_IDENTITY_MISMATCH')
    layout=reading.get('layout_pass')
    require(isinstance(layout,dict) and layout.get('backend')=='tesseract'
            and layout.get('backend_version')==reading['backend_version'] and layout.get('language')=='eng'
            and type(layout.get('page_segmentation_mode')) is int and layout['page_segmentation_mode']==3,
            'RENDERED_LAYOUT_BACKEND_MISMATCH')
    layout_path=incoming/(prefix+'-owned-window.layout.ocr.txt')
    layout_identity=file_identity(layout_path)
    require(layout.get('crop_sha256')==crop_identity['sha256']
            and layout.get('raw_text_file')==layout_path.name
            and layout.get('raw_text_sha256')==layout_identity['sha256']
            and type(layout.get('raw_text_bytes')) is int
            and layout['raw_text_bytes']==layout_identity['bytes']
            and layout_identity['bytes']<=observer.OCR_MAX_BYTES,'RENDERED_LAYOUT_IDENTITY_MISMATCH')
    try:
        screen_pixels=pixels.inspect(screenshot)
        crop_pixels=pixels.inspect(crop)
    except (OSError,ValueError,Image.DecompressionBombError) as error:
        raise SystemExit('RENDERED_PIXELS_UNVERIFIED:'+str(error)) from None
    require(screen_pixels['screenshot_sha256']==image_identity['sha256']
            and crop_pixels['screenshot_sha256']==crop_identity['sha256'],'RENDERED_PIXELS_CHANGED')
    geometry=reading.get('owned_window_geometry')
    require(isinstance(geometry,list) and len(geometry)==4 and all(type(n) is int for n in geometry),
            'RENDERED_WINDOW_GEOMETRY_INVALID')
    x,y,width,height=geometry
    require(x>=0 and y>=0 and width>=320 and height>=200
            and x+width<=screen_pixels['width'] and y+height<=screen_pixels['height'],
            'RENDERED_WINDOW_CROP_OUTSIDE_CAPTURE')
    require(reading.get('image_transform')=='owned-window-crop-only'
            and reading.get('crop_rectangle')==geometry
            and reading.get('screenshot_dimensions')==[screen_pixels['width'],screen_pixels['height']]
            and [crop_pixels['width'],crop_pixels['height']]==[width,height],
            'RENDERED_WINDOW_CROP_BINDING_MISMATCH')
    # Independently compare decoded pixels. No resized, restyled or substituted
    # image can stand in for the owned region of the retained fresh capture.
    with Image.open(screenshot) as original,Image.open(crop) as cropped:
        expected=original.crop((x,y,x+width,y+height))
        require(cropped.mode==expected.mode and cropped.size==expected.size
                and cropped.convert('RGBA').tobytes()==expected.convert('RGBA').tobytes(),
                'RENDERED_WINDOW_CROP_PIXELS_MISMATCH')
    raw=text_path.read_bytes()
    require(len(raw)==text_identity['bytes'] and hashlib.sha256(raw).hexdigest()==text_identity['sha256'],
            'RENDERED_RAW_TEXT_CHANGED')
    text=raw.decode('utf-8')
    require(reading.get('raw_text')==text,'RENDERED_RAW_TEXT_MISMATCH')
    layout_raw=layout_path.read_bytes()
    require(len(layout_raw)==layout_identity['bytes']
            and hashlib.sha256(layout_raw).hexdigest()==layout_identity['sha256'],'RENDERED_LAYOUT_TEXT_CHANGED')
    layout_text=layout_raw.decode('utf-8')
    require(layout.get('raw_text')==layout_text,'RENDERED_LAYOUT_TEXT_MISMATCH')
    try:
        matches=observer.rendered_text_matches(text,layout_text,retired=retired)
        observer.require_rendered_text(matches,retired=retired)
    except observer.base.Unverified as error:
        raise SystemExit('RENDERED_TEXT_PREDICATE_REFUSED:'+str(error)) from None
    require(all(reading.get(key)==value for key,value in matches.items()),'RENDERED_TEXT_PREDICATE_MISMATCH')
    for path,identity in ((screenshot,image_identity),(crop,crop_identity),(text_path,text_identity),(layout_path,layout_identity)):
        require(file_identity(path)==identity,'RENDERED_EVIDENCE_CHANGED:'+path.name)
    return {'screenshot':image_identity,'ownedWindowCrop':crop_identity,'rawOcrText':text_identity,
            'layoutOcrText':layout_identity,'screenshotPixelReadback':screen_pixels,'cropPixelReadback':crop_pixels}

def verify_rendered_attempts(receipt,prefix,images,retired=False):
    binding=receipt.get('rendered_attempts')
    require(isinstance(binding,dict) and set(binding)=={'manifest_file','manifest_sha256','attempts_directory','attempt_count','accepted_attempt'},
            'RENDERED_ATTEMPTS_BINDING_MISSING')
    manifest_name=prefix+'-attempts.json'
    attempts_directory=prefix+'-attempts'
    require(binding.get('manifest_file')==manifest_name and binding.get('attempts_directory')==attempts_directory,
            'RENDERED_ATTEMPTS_PATH_MISMATCH')
    manifest=read_receipt(manifest_name)
    require(binding.get('manifest_sha256')==manifest['sha256'],'RENDERED_ATTEMPTS_DIGEST_MISMATCH')
    summary=manifest['receipt']
    rows=summary.get('attempts')
    require(summary.get('schema')=='xiio.hex.rendered-artcraft-attempts/v1'
            and type(summary.get('max_attempts')) is int and summary['max_attempts']==40
            and isinstance(rows,list) and 1<=len(rows)<=40
            and type(binding.get('attempt_count')) is int and binding['attempt_count']==len(rows),
            'RENDERED_ATTEMPTS_DENOMINATOR_MISMATCH')
    expected_files={images[key]['file']:{k:images[key][k] for k in ('bytes','sha256')}
                    for key in ('screenshot','ownedWindowCrop','rawOcrText','layoutOcrText')}
    allowed_files=set(expected_files)
    missing_text='RETIRED_DEV12_RENDERED_TITLE_NOT_OBSERVED' if retired else 'ARTCRAFT_RENDERED_CONTENT_NOT_OBSERVED'
    retryable={'PNG_BLANK_OR_PREPAINT','PNG_FLAT_FRAME_NO_UI_TEXTURE',missing_text}
    members={manifest_name:{k:manifest[k] for k in ('file','bytes','sha256')}}
    accepted_record=None
    directories=[]
    for index,row in enumerate(rows,1):
        require(isinstance(row,dict) and set(row)=={'attempt','directory','outcome','failure_category','record_sha256'}
                and type(row.get('attempt')) is int and row['attempt']==index,
                'RENDERED_ATTEMPT_ROW_INVALID')
        directory=row.get('directory')
        require(isinstance(directory,str),'RENDERED_ATTEMPT_DIRECTORY_INVALID')
        relative=pathlib.PurePosixPath(directory)
        require(len(relative.parts)==2 and relative.parts[0]==attempts_directory
                and re.fullmatch(rf'{index:02d}-[a-z0-9_]{{8}}',relative.parts[1]) is not None,
                'RENDERED_ATTEMPT_DIRECTORY_INVALID')
        directories.append(directory)
        accepted=index==len(rows)
        require(row.get('outcome')==('OBSERVED' if accepted else 'RETRYABLE')
                and (row.get('failure_category') is None if accepted else row.get('failure_category') in retryable),
                'RENDERED_ATTEMPT_OUTCOME_INVALID')
        record_name=directory+'/attempt.json'
        record_wrapper=read_receipt(record_name)
        require(record_wrapper['sha256']==row.get('record_sha256'),'RENDERED_ATTEMPT_RECORD_DIGEST_MISMATCH')
        record=record_wrapper['receipt']
        require(record.get('schema')=='xiio.hex.rendered-artcraft-attempt/v1'
                and type(record.get('attempt')) is int and record['attempt']==index
                and record.get('outcome')==row['outcome'] and record.get('failure_category')==row['failure_category'],
                'RENDERED_ATTEMPT_RECORD_MISMATCH')
        if accepted or row['failure_category']==missing_text:
            require(isinstance(record.get('rendered_text_readback'),dict),'OCR_ATTEMPT_READBACK_MISSING')
            verify_ocr_binding(record['rendered_text_readback'])
        files=record.get('files')
        require(isinstance(files,dict) and set(files).issubset(allowed_files)
                and prefix+'.png' in files,'RENDERED_ATTEMPT_FILES_INVALID')
        require((set(files)==allowed_files if accepted or row['failure_category']==missing_text
                 else set(files)=={prefix+'.png'}),'RENDERED_ATTEMPT_FILES_INCOMPLETE')
        actual_directory=incoming/directory
        require(actual_directory.is_dir() and not actual_directory.is_symlink()
                and {p.name for p in actual_directory.iterdir()}==set(files)|{'attempt.json'},
                'RENDERED_ATTEMPT_DIRECTORY_CONTENTS_MISMATCH')
        members[record_name]={k:record_wrapper[k] for k in ('file','bytes','sha256')}
        for filename,expected in files.items():
            require(isinstance(expected,dict) and set(expected)=={'bytes','sha256'}
                    and type(expected['bytes']) is int and expected['bytes']>=0,
                    'RENDERED_ATTEMPT_FILE_IDENTITY_INVALID')
            member_name=directory+'/'+filename
            identity=file_identity(incoming/member_name)
            require({k:identity[k] for k in ('bytes','sha256')}==expected,'RENDERED_ATTEMPT_FILE_DIGEST_MISMATCH')
            members[member_name]=identity
        if accepted:
            require(files==expected_files and record.get('rendered_text_readback')==receipt.get('rendered_text_readback'),
                    'RENDERED_ACCEPTED_ATTEMPT_PROMOTION_MISMATCH')
            accepted_record=record_wrapper
    require(binding.get('accepted_attempt')==summary.get('accepted_attempt')==directories[-1],
            'RENDERED_ACCEPTED_ATTEMPT_MISMATCH')
    parent=incoming/attempts_directory
    require(parent.is_dir() and not parent.is_symlink()
            and {p.name for p in parent.iterdir()}=={pathlib.PurePosixPath(d).name for d in directories},
            'RENDERED_ATTEMPTS_DIRECTORY_CONTENTS_MISMATCH')
    for name,identity in members.items():
        require(file_identity(incoming/name)==identity,'RENDERED_ATTEMPTS_EVIDENCE_CHANGED')
    return {'manifest':manifest,'acceptedAttempt':accepted_record,'members':members}

def verify_execution_scope(receipt,mode,target):
    require(receipt.get('schema')=='xiio.hex.extracted-artcraft-initialization/v1'
            and receipt.get('observation_mode')==mode and receipt.get('physical_target')==target,
            'NATIVE_ARTCRAFT_EXECUTION_SCOPE_MISMATCH')
    require(receipt.get('github_run_id')==run and receipt.get('github_run_attempt')==attempt,
            'NATIVE_ARTCRAFT_RUN_MISMATCH')
    require(receipt.get('executor_os',{}).get('ID')=='ubuntu'
            and receipt.get('executor_os',{}).get('VERSION_ID')=='22.04','NATIVE_ARTCRAFT_OS_MISMATCH')
    require(receipt.get('input_backend')=='XTEST' and receipt.get('readback_backend')=='AT-SPI'
            and type(receipt.get('pid')) is int and receipt['pid']>1
            and isinstance(receipt.get('window_id'),str) and receipt['window_id'].isdigit()
            and int(receipt['window_id'])>0,'NATIVE_ARTCRAFT_PROCESS_READBACK_MISSING')
    require_false(receipt,('domain_action_verified','installer_action_verified','aries_install',
                          'provider_effect','pop_os_acceptance','release_promotion'),
                  'NATIVE_ARTCRAFT_SCOPE_INFLATED')
    require('failure_category' not in receipt,'NATIVE_ARTCRAFT_FAILURE_RECEIPT_REFUSED')
    require(receipt.get('package_identity_verified') is True
            and receipt.get('extracted_elf_identity_verified') is True,'NATIVE_ARTCRAFT_IDENTITIES_UNVERIFIED')

# Import only the selected source's existing pure selectors and pixel checker.
# This reopens retained evidence; it does not claim another live window run.
accepted_blob('scripts/verify-installed-snap55.py')
observer=load_accepted_module('scripts/verify-extracted-artcraft.py','accepted_artcraft_observer')
pixels=load_accepted_module('scripts/verify-hex-capture.py','accepted_hex_pixels')
ocr_toolchain=verify_ocr_toolchain()
front_wrapper=read_receipt('hex-native-frontend-identity.json')
front=front_wrapper['receipt']
require(front.get('source_commit')==merge and front.get('github_sha')==merge
        and front.get('source_tree')==tree,'FRONTEND_SOURCE_BINDING_MISMATCH')
require(front.get('github_run_id')==run and front.get('github_run_attempt')==attempt,'FRONTEND_RUN_BINDING_MISMATCH')
require(front.get('package_version')=='0.1.0-dev.13'
        and front.get('native_elf_sha256')==elf_sha
        and front.get('debian_package_sha256')==deb_sha
        and front.get('debian_package_name')=='XI-IO HEX DEV_0.1.0-dev.13_amd64.deb',
        'FRONTEND_PACKAGE_BINDING_MISMATCH')
require(front.get('qualification')=='BUILT_FRONTEND_NOT_INSTALLED_ACCEPTANCE'
        and front.get('frontend_staged_match') is True,'FRONTEND_QUALIFICATION_MISSING')
require_false(front,('pop_os_acceptance','release_promotion'),'FRONTEND_SCOPE_INFLATED')
require(front.get('build_os',{}).get('ID')=='ubuntu'
        and front.get('build_os',{}).get('VERSION_ID')=='22.04','FRONTEND_BUILD_OS_MISMATCH')
recovery={
    'cube_provider_revision':'86af5948722aefe2cf562e0efbe6c4373418f2ef',
    'runtime_source_revision':'ec205366ebe42635e155b9ab246f036052fef406',
    'lifecycle_patch_git_blob':accepted_blob('tools/artcraft-launcher/lifecycle.patch'),
    'xiio_profile_patch_git_blob':accepted_blob('tools/artcraft-launcher/xiio-catalog.patch'),
    'hosted_profile':'xiio-hex',
    'body_git_blob':accepted_blob('src/components/ArtcraftLauncherBody.tsx'),
    'later_aries_revision_verified':False}
require(recovery['lifecycle_patch_git_blob']=='0e09a389078baa8ddf9750313727c1eaa5300b5b'
        and front.get('artcraft_recovery')==recovery
        and front['artcraft_recovery'].get('later_aries_revision_verified') is False,
        'ARTCRAFT_RECOVERY_BINDING_MISMATCH')
frontend_archive=file_identity(incoming/'hex-built-frontend.tgz')
require(front.get('frontend_archive_sha256')==frontend_archive['sha256'],'FRONTEND_ARCHIVE_DIGEST_MISMATCH')
files=front.get('frontend_files')
require(isinstance(files,dict) and 'index.html' in files and len(files)>1,'FRONTEND_FILE_DENOMINATOR_MISSING')
assets=('launcher.js','launcher_bg.wasm','LICENSE-APACHE','LICENSE-MIT','NOTICE','ATTRIBUTION.md',
        'OFL-Inter.txt','OFL-Archivo.txt','OFL-GeistMono.txt')
require(all('donor/artcraft-launcher-web/'+name in files for name in assets),'ARTCRAFT_PACKAGED_ASSETS_MISSING')
actual={}
with tarfile.open(incoming/'hex-built-frontend.tgz','r:gz') as archive:
    for member in archive:
        name=pathlib.PurePosixPath(member.name)
        require(not name.is_absolute() and '..' not in name.parts,'FRONTEND_ARCHIVE_PATH_INVALID')
        if member.isdir():continue
        require(member.isfile() and str(name) not in actual,'FRONTEND_ARCHIVE_MEMBER_INVALID')
        h=hashlib.sha256()
        with archive.extractfile(member) as stream:
            for chunk in iter(lambda:stream.read(1024*1024),b''):h.update(chunk)
        actual[str(name)]={'bytes':member.size,'sha256':h.hexdigest()}
require(actual==files,'FRONTEND_ARCHIVE_FILES_MISMATCH')
require(all(actual['donor/artcraft-launcher-web/'+name]['bytes']>0 for name in assets),'ARTCRAFT_PACKAGED_ASSETS_EMPTY')

render_wrapper=read_receipt('software-initialization.json')
render=render_wrapper['receipt']
verify_execution_scope(render,'installed-candidate','GITHUB_HOSTED_XVFB_INSTALLED_PACKAGE')
require(render.get('status')=='INITIALIZED' and render.get('initialization_observed') is True
        and render.get('xiio_catalog_rendered') is True,'NATIVE_ARTCRAFT_RENDER_NOT_QUALIFIED')
require(render.get('source_commit')==merge and render.get('source_tree')==tree
        and render.get('native_elf_sha256')==elf_sha and render.get('debian_package_sha256')==deb_sha
        and render.get('package_version')=='0.1.0-dev.13','NATIVE_ARTCRAFT_PACKAGE_BINDING_MISMATCH')
require(render.get('frontend_identity_sha256')==front_wrapper['sha256']
        and render.get('frontend_archive_sha256')==frontend_archive['sha256']
        and render.get('frontend_build_os')==front.get('build_os'),'NATIVE_ARTCRAFT_FRONTEND_BINDING_MISMATCH')
require(render.get('installed_package') is True and render.get('installed_package_name')=='xi-io-hex-dev'
        and render.get('installed_package_version')=='0.1.0-dev.13'
        and render.get('installed_package_status')=='install ok installed'
        and render.get('installed_package_readback_backend')=='dpkg-query','NATIVE_INSTALLED_PACKAGE_UNVERIFIED')
control=render.get('observed_initialization_control')
require(isinstance(control,dict) and set(control)=={'name','role','visible'}
        and isinstance(control.get('name'),str) and len(control['name'])<=4096
        and ' '.join(control['name'].split())==observer.INITIALIZED_NAME
        and control.get('role')=='status' and control.get('visible') is True,'NATIVE_ARTCRAFT_READY_STATUS_MISMATCH')
render_images=verify_rendered_readback(render,'software-initialized')
render_attempts=verify_rendered_attempts(render,'software-initialized',render_images)

retired_wrapper=read_receipt('hex-dev12-ui-red.json')
retired=retired_wrapper['receipt']
verify_execution_scope(retired,'retired-dev12','GITHUB_HOSTED_XVFB_EXTRACTED_PACKAGE')
require(retired.get('status')=='RETIRED_DEV12_REFUSED' and retired.get('red_established') is True
        and retired.get('retired_reference_cards_observed') is True and retired.get('retired_title_rendered') is True
        and retired.get('artcraft_readiness_refusal')=='ARTCRAFT_INITIALIZATION_NOT_OBSERVED',
        'RETIRED_DEV12_REFUSAL_NOT_QUALIFIED')
require(retired.get('candidate_verifier_source')==merge,'RETIRED_DEV12_VERIFIER_SOURCE_MISMATCH')
require(retired.get('release_tag')=='xiio-hex-local-d160521c-dev12'
        and retired.get('released_source_commit')=='d160521cffd3ff7e627155050faeecc693ac76bc'
        and retired.get('compiled_source_commit')=='cd7716a1c40ca6b6fb7393fcedb8ae50f5a5a2b6','RETIRED_DEV12_RELEASE_MISMATCH')
require(retired.get('debian_package_sha256')==retired.get('expected_debian_package_sha256')==observer.DEV12_PACKAGE_SHA256
        and retired.get('native_elf_sha256')==retired.get('expected_native_elf_sha256')==observer.DEV12_ELF_SHA256,
        'RETIRED_DEV12_BYTES_MISMATCH')
require_false(retired,('installed_package','initialization_observed','xiio_catalog_rendered'),
              'RETIRED_DEV12_SCOPE_INFLATED')
controls=retired.get('observed_retired_controls')
require(isinstance(controls,list) and len(controls)==len(observer.DEV12_CARD_NAMES),'RETIRED_DEV12_CONTROLS_MISSING')
for control,name in zip(controls,observer.DEV12_CARD_NAMES):
    require(isinstance(control,dict) and set(control)=={'name','role','visible'}
            and isinstance(control.get('name'),str) and len(control['name'])<=4096
            and ' '.join(control['name'].split())==name and control.get('role')=='button'
            and control.get('visible') is True,'RETIRED_DEV12_CONTROLS_MISMATCH')
retired_images=verify_rendered_readback(retired,'software-retired-dev12',retired=True)
retired_attempts=verify_rendered_attempts(retired,'software-retired-dev12',retired_images,retired=True)
require(file_identity(package)['sha256']==deb_sha,'PUBLISH_PACKAGE_CHANGED')

# Keep the actual evidence bytes available after the producing CI ZIP expires.
# Only these already verified files are eligible. The public package remains
# separate, and the simple customer SHA256SUMS still verifies that package alone.
evidence_names=(
    'hex-native-frontend-identity.json','hex-built-frontend.tgz','hex-ocr-identity.json','hex-ocr-toolchain.tgz',
    'software-initialization.json',
    'software-initialized.png','software-initialized-owned-window.png','software-initialized-owned-window.ocr.txt',
    'software-initialized-owned-window.layout.ocr.txt',
    'hex-dev12-ui-red.json','software-retired-dev12.png','software-retired-dev12-owned-window.png',
    'software-retired-dev12-owned-window.ocr.txt','software-retired-dev12-owned-window.layout.ocr.txt')
# The parent receipts bind the attempt manifests. Retain every referenced record
# and frame too, including rejected prepaint attempts and the accepted original.
evidence_names+=tuple(render_attempts['members'])+tuple(retired_attempts['members'])
require(len(evidence_names)==len(set(evidence_names)),'NATIVE_EVIDENCE_DUPLICATE_MEMBER')
evidence_members={name:file_identity(incoming/name) for name in evidence_names}
for wrapper in (front_wrapper,render_wrapper,retired_wrapper,ocr_toolchain['identity']):
    require(evidence_members[wrapper['file']]=={k:wrapper[k] for k in ('file','bytes','sha256')},
            'NATIVE_RECEIPT_CHANGED_BEFORE_RETENTION')
require(evidence_members[frontend_archive['file']]==frontend_archive,'FRONTEND_ARCHIVE_CHANGED_BEFORE_RETENTION')
require(evidence_members[ocr_toolchain['archive']['file']]==ocr_toolchain['archive'],
        'OCR_TOOLCHAIN_ARCHIVE_CHANGED_BEFORE_RETENTION')
for group in (render_images,retired_images):
    for key in ('screenshot','ownedWindowCrop','rawOcrText','layoutOcrText'):
        require(evidence_members[group[key]['file']]==group[key],'RENDERED_EVIDENCE_CHANGED_BEFORE_RETENTION')
for attempts in (render_attempts,retired_attempts):
    require(all(evidence_members[name]==identity for name,identity in attempts['members'].items()),
            'RENDERED_ATTEMPTS_CHANGED_BEFORE_RETENTION')
evidence_path=directory/'NATIVE-EVIDENCE.zip'
with zipfile.ZipFile(evidence_path,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
    for name in evidence_names:
        raw=(incoming/name).read_bytes()
        require(len(raw)==evidence_members[name]['bytes']
                and hashlib.sha256(raw).hexdigest()==evidence_members[name]['sha256'],
                'NATIVE_EVIDENCE_CHANGED_BEFORE_WRITE:'+name)
        member=zipfile.ZipInfo(name,date_time=(1980,1,1,0,0,0))
        member.create_system=3
        member.external_attr=0o100644<<16
        member.compress_type=zipfile.ZIP_DEFLATED
        archive.writestr(member,raw)
with zipfile.ZipFile(evidence_path) as archive:
    require(archive.namelist()==list(evidence_names) and archive.testzip() is None,'NATIVE_EVIDENCE_ARCHIVE_READBACK_FAILED')
    for name in evidence_names:
        raw=archive.read(name)
        require(len(raw)==evidence_members[name]['bytes']
                and hashlib.sha256(raw).hexdigest()==evidence_members[name]['sha256'],
                'NATIVE_EVIDENCE_ARCHIVE_MEMBER_MISMATCH:'+name)
evidence_archive=file_identity(evidence_path)
body={
 'schema':'xiio.hex.local-first-release/v1',
 'sourceCommit':source,'sourceTree':tree,'qualifiedPrHead':head,'testedMerge':merge,
 'originalCiRun':int(run),'cliQualificationRun':int(cli_run),
 'contractRunAttempt':int(attempt),'cliRunAttempt':int(cli_attempt),
 'originalArtifactId':int(artifact_id),'originalArtifactName':artifact_name,
 'artifactZipBytes':int(archive_bytes),'artifactZipSha256':archive_sha,
 'originalDebSha256':deb_sha,'binarySha256':elf_sha,
 'newDebVersion':'0.1.0-dev.13','newDebName':package.name,
 'newDebBytes':package.stat().st_size,'newDebSha256':deb_sha,
 'change':'Filename normalization only; package bytes unchanged from verified CI artifact',
 'embeddedCliSource':embedded_cli,'cli101102ConductorPathParityIncluded':False,
 'packagedSourceReadback':113,'hostedProcessOwnedVisibleWindowObserved':True,
 'renderedArtcraftXiioContentVerified':True,'retiredDev12CatalogObservedAndRefused':True,
 'artcraftRecovery':recovery,'laterAriesRevisionVerified':False,
 'nativeProductActionVerified':False,'poposFirstUseVerified':False,
 'managedUpgradeQualified':False,'remoteConnected':False,'sessionVerified':False,'wardAdmitted':False,
 'nativeEvidence':{
     'frontendIdentity':front_wrapper,'currentArtcraftRender':render_wrapper,'retiredDev12Refusal':retired_wrapper,
     'frontendArchive':frontend_archive,'currentArtcraftImages':render_images,'retiredDev12Images':retired_images,
     'ocrToolchain':ocr_toolchain,
     'currentArtcraftAttempts':render_attempts,'retiredDev12Attempts':retired_attempts,
     'durableArchive':evidence_archive,'durableArchiveMembers':evidence_members,
     'readbackScope':'Retained original evidence independently reopened; no additional live native or Pop!_OS execution',
     'sourceLinks':{
         'productSource':f'https://github.com/{repository}/tree/{source}',
         'observer':f'https://github.com/{repository}/blob/{merge}/scripts/verify-extracted-artcraft.py',
         'workflow':f'https://github.com/{repository}/blob/{merge}/.github/workflows/installer-contract.yml',
         'producingRun':f'https://github.com/{repository}/actions/runs/{run}/attempts/{attempt}'}}
}
(directory/'PROVENANCE.json').write_text(json.dumps(body,indent=2)+'\n')
PY
url="https://github.com/$GITHUB_REPOSITORY/releases/download/$XIIO_HEX_RELEASE_TAG"
cat > "$root/publish/INSTALL-LOCAL-FIRST.txt" <<TXT
XI-IO HEX local-first Linux DEV13 prerelease
Accepted source: $source_sha
Source tree: $source_tree
Qualified PR head: $qualified_head
Tested merge: $tested_merge
Package: $XIIO_HEX_PACKAGE_NAME
SHA-256: $deb_sha
Embedded CLI source: $embedded_cli

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
Open XI-IO CLI requires an already registered Linux desktop terminal at
/usr/bin/x-terminal-emulator. After installed-generation readback, it opens that
terminal in the project folder you explicitly select. HEX does not package Node
or a terminal application. Native Open on Pop!_OS has not yet been verified.
The embedded CLI remains at the source identity above. The newer CLI #101/#102
conductor and PATH-parity work is not included in this HEX prerelease.

Evidence: pinned current CI installed these exact package bytes on disposable
Ubuntu and independently observed the recovered Artcraft renderer with XI-IO
product content in its native window. Its visible title and installation-review
action were read from the owned window capture. The same observer identified and
refused the retired DEV12 catalog. This recovered candidate is not claimed to be
the exact later Artcraft revision previously approved on Aries.
PROVENANCE.json embeds the validated original receipts and their hashes.
NATIVE-EVIDENCE.zip retains the frontend, native screenshots, exact window crops
and both uncorrected OCR passes from each unchanged crop. It also retains every
referenced capture-attempt record and frame, including rejected prepaint attempts.
The pinned OCR executable, English data and runtime files are retained with their
source, run and byte identities. They are verification evidence, not product dependencies.
Its digest and member identities are recorded in PROVENANCE.json.
Pop!_OS first use and a real product action remain pending. This is a local development prerelease,
not managed-upgrade, remote-execution or installed-product qualification.
TXT
printf '%s\n' "HEX_LOCAL_FIRST_DEV13_ARTIFACT_STAGED" \
  "POPOS_FIRST_USE=NOT_RUN" "RENDERED_ARTCRAFT_XIIO=VERIFIED_HOSTED_UBUNTU" \
  "RETIRED_DEV12_UI=OBSERVED_AND_REFUSED" "NATIVE_PRODUCT_ACTION=NOT_VERIFIED" \
  "MANAGED_UPGRADE=NOT_QUALIFIED"
