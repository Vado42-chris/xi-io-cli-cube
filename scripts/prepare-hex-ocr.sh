#!/usr/bin/env bash
# Prepare the observer's pinned OCR tool only on the disposable hosted bench.
set -euo pipefail
refuse() { printf '%s\n' "$1" >&2; exit 78; }
[[ "${GITHUB_ACTIONS:-}" = true && "${RUNNER_ENVIRONMENT:-}" = github-hosted ]] || refuse OCR_HOSTED_RUNNER_REQUIRED
[[ $# = 2 ]] || refuse OCR_SOURCE_ARGUMENTS_REQUIRED
[[ "${GITHUB_SHA:-}" =~ ^[a-f0-9]{40}$ && "${GITHUB_RUN_ID:-}" =~ ^[1-9][0-9]*$ && "${GITHUB_RUN_ATTEMPT:-}" =~ ^[1-9][0-9]*$ ]] || refuse OCR_RUN_IDENTITY_REQUIRED
[[ -n "${RUNNER_TEMP:-}" && -n "${GITHUB_WORKSPACE:-}" && -n "${GITHUB_ENV:-}" ]] || refuse OCR_WORKSPACE_REQUIRED

ocr_tesseract_source=$1
ocr_leptonica_source=$2
ocr_tesseract_ref=64eab6c457b2337dd690746a5fde5c222b40d5f8
ocr_leptonica_ref=7e803e73511fbd320f01314c141d35d2b8491dde
ocr_language_ref=87416418657359cb625c412a48b6e1d6d41c29bd
ocr_prefix="$RUNNER_TEMP/hex-ocr-qualified"
ocr_build="$RUNNER_TEMP/hex-ocr-build"
ocr_identity="$GITHUB_WORKSPACE/hex-ocr-identity.json"
ocr_archive="$GITHUB_WORKSPACE/hex-ocr-toolchain.tgz"

python3 -I -B - "$ocr_tesseract_source" "$ocr_leptonica_source" "$ocr_prefix" "$ocr_build" "$ocr_identity" "$ocr_archive" <<'PY'
import os,pathlib,subprocess,sys
def require(value,code):
    if not value: raise SystemExit(code)
workspace=pathlib.Path(os.environ['GITHUB_WORKSPACE'])
temporary=pathlib.Path(os.environ['RUNNER_TEMP'])
for path in (workspace,temporary,*map(pathlib.Path,sys.argv[1:3])):
    require(path.is_absolute() and path.is_dir() and not any(p.is_symlink() for p in [path,*path.parents]),'OCR_INPUT_DIRECTORY_INVALID')
require(pathlib.Path.cwd()==workspace,'OCR_WORKSPACE_MISMATCH')
require(subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==os.environ['GITHUB_SHA'],'OCR_CHECKOUT_MISMATCH')
for value,root in ((sys.argv[3],temporary),(sys.argv[4],temporary),(sys.argv[5],workspace),(sys.argv[6],workspace)):
    path=pathlib.Path(value)
    require(path.parent==root and not path.exists() and not path.is_symlink(),'OCR_OUTPUT_EXISTS_OR_OUTSIDE_ROOT')
PY
for ocr_pair in "$ocr_tesseract_source:$ocr_tesseract_ref" "$ocr_leptonica_source:$ocr_leptonica_ref"; do
  ocr_source=${ocr_pair%:*}
  ocr_ref=${ocr_pair##*:}
  [[ "$(git -C "$ocr_source" rev-parse HEAD)" = "$ocr_ref" ]] || refuse OCR_SOURCE_REVISION_MISMATCH
  [[ -z "$(git -C "$ocr_source" status --porcelain --untracked-files=all)" ]] || refuse OCR_SOURCE_DIRTY
done
[[ "$(cat "$ocr_tesseract_source/VERSION")" = 5.5.0 ]] || refuse OCR_SOURCE_VERSION_MISMATCH

# Tesseract and Leptonica are statically incorporated. Remaining decoder/system
# libraries are independently hashed, retained, and checked by the observer.
unset LD_PRELOAD LD_LIBRARY_PATH LD_AUDIT TESSDATA_PREFIX CFLAGS CXXFLAGS CPPFLAGS LDFLAGS
export LC_ALL=C OMP_THREAD_LIMIT=1 OMP_NUM_THREADS=1
mkdir -m 0700 "$ocr_prefix" "$ocr_build"
cmake -S "$ocr_leptonica_source" -B "$ocr_build/leptonica" \
  -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="$ocr_prefix" \
  -DBUILD_SHARED_LIBS=OFF -DBUILD_PROG=OFF -DSW_BUILD=OFF -DSTRICT_CONF=ON \
  -DENABLE_PNG=ON -DENABLE_ZLIB=ON -DENABLE_GIF=OFF -DENABLE_JPEG=OFF \
  -DENABLE_TIFF=OFF -DENABLE_WEBP=OFF -DENABLE_OPENJPEG=OFF
cmake --build "$ocr_build/leptonica" --parallel 2
cmake --install "$ocr_build/leptonica"
cmake -S "$ocr_tesseract_source" -B "$ocr_build/tesseract" \
  -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="$ocr_prefix" \
  -DLeptonica_DIR="$ocr_prefix/lib/cmake/leptonica" \
  -DBUILD_SHARED_LIBS=OFF -DBUILD_TRAINING_TOOLS=OFF -DBUILD_TESTS=OFF \
  -DSW_BUILD=OFF -DOPENMP_BUILD=ON -DENABLE_NATIVE=OFF -DENABLE_LTO=OFF \
  -DDISABLE_TIFF=ON -DDISABLE_ARCHIVE=ON -DDISABLE_CURL=ON -DINSTALL_CONFIGS=OFF
cmake --build "$ocr_build/tesseract" --target tesseract --parallel 2
mkdir -p "$ocr_prefix/bin" "$ocr_prefix/share/tessdata" "$ocr_prefix/licenses" "$ocr_prefix/runtime" "$ocr_prefix/copyright"
install -m 0555 "$ocr_build/tesseract/bin/tesseract" "$ocr_prefix/bin/tesseract"
curl --fail --location --proto '=https' --proto-redir '=https' --tlsv1.2 \
  --connect-timeout 15 --max-time 120 \
  "https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/$ocr_language_ref/eng.traineddata" \
  --output "$ocr_prefix/share/tessdata/eng.traineddata"
printf '%s  %s\n' 7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2 \
  "$ocr_prefix/share/tessdata/eng.traineddata" | sha256sum --check
install -m 0444 "$ocr_tesseract_source/LICENSE" "$ocr_prefix/licenses/Tesseract-LICENSE"
install -m 0444 "$ocr_leptonica_source/leptonica-license.txt" "$ocr_prefix/licenses/Leptonica-LICENSE"
curl --fail --location --proto '=https' --proto-redir '=https' --tlsv1.2 \
  --connect-timeout 15 --max-time 120 \
  "https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/$ocr_language_ref/LICENSE" \
  --output "$ocr_prefix/licenses/Tessdata-LICENSE"

python3 -I -B - "$ocr_prefix" "$ocr_identity" "$ocr_archive" <<'PY'
import hashlib,json,os,pathlib,re,shutil,subprocess,sys,tarfile
prefix,identity_path,archive_path=map(pathlib.Path,sys.argv[1:])
def require(value,code):
    if not value: raise SystemExit(code)
def raw_identity(path):
    require(path.is_file() and not any(p.is_symlink() for p in [path,*path.parents]),'OCR_FILE_CUSTODY_INVALID')
    raw=path.read_bytes()
    return {'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
def git_blob(path):
    raw=path.read_bytes()
    return hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
executable=prefix/'bin/tesseract'
language=prefix/'share/tessdata/eng.traineddata'
require(raw_identity(language)=={'bytes':4113088,'sha256':'7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2'}
        and git_blob(language)=='bbef4675053b5b468cdb477053e28b1c698ba08e','OCR_LANGUAGE_IDENTITY_MISMATCH')
require(git_blob(prefix/'licenses/Tessdata-LICENSE')=='d645695673349e3947e8e5ae42332d0ac3164cd7','OCR_LANGUAGE_LICENSE_MISMATCH')
environment=dict(os.environ)
for key in ('LD_PRELOAD','LD_LIBRARY_PATH','LD_AUDIT','TESSDATA_PREFIX'):
    environment.pop(key,None)
environment['OMP_THREAD_LIMIT']='1'
environment['OMP_NUM_THREADS']='1'
environment['LC_ALL']='C'
version=subprocess.run([str(executable),'--version'],env=environment,check=True,capture_output=True,text=True,timeout=5).stdout
require(0<len(version)<=4096 and version.splitlines()[0]=='tesseract 5.5.0'
        and 'leptonica-1.84.1' in version,'OCR_BUILT_VERSION_MISMATCH')
linked=subprocess.run(['/usr/bin/ldd',str(executable)],env=environment,check=True,capture_output=True,text=True,timeout=5).stdout
require(0<len(linked)<=32768 and 'not found' not in linked,'OCR_RUNTIME_UNRESOLVED')
require(not re.search(r'lib(?:tesseract|lept|leptonica)[-.]',linked),'OCR_ALGORITHM_NOT_STATIC')
resolved=set()
for line in linked.splitlines():
    if 'linux-vdso' in line: continue
    match=re.fullmatch(r'\s*(?:\S+\s+=>\s+)?(/\S+)\s+\(0x[0-9a-f]+\)\s*',line)
    require(match is not None,'OCR_RUNTIME_RECORD_UNRECOGNIZED')
    path=pathlib.Path(match.group(1)).resolve(strict=True)
    require(path.is_absolute() and str(path).startswith('/usr/lib/'),'OCR_RUNTIME_PATH_UNEXPECTED')
    resolved.add(path)
require(1<=len(resolved)<=32,'OCR_RUNTIME_DENOMINATOR_INVALID')
runtime=[]
packages={}
for path in sorted(resolved):
    record=raw_identity(path)
    relative='runtime/'+record['sha256']+'-'+path.name
    copied=prefix/relative
    shutil.copyfile(path,copied)
    require(raw_identity(copied)==record,'OCR_RUNTIME_COPY_MISMATCH')
    runtime.append({'resolved_path':str(path),**record,'archive_path':relative})
    owners=set()
    for candidate in (str(path),str(path).removeprefix('/usr')):
        result=subprocess.run(['/usr/bin/dpkg-query','--search',candidate],capture_output=True,text=True,timeout=5)
        if result.returncode==0:
            for line in result.stdout.splitlines():
                package=line.split(': ',1)[0]
                require(re.fullmatch(r'[a-z0-9][a-z0-9+.-]*(?::[a-z0-9-]+)?',package) is not None,'OCR_RUNTIME_PACKAGE_INVALID')
                owners.add(package)
    require(len(owners)==1,'OCR_RUNTIME_PACKAGE_UNBOUND')
    package=owners.pop()
    if package not in packages:
        version_record=subprocess.check_output(['/usr/bin/dpkg-query','--show','--showformat=${binary:Package}\t${Version}\n',package],text=True,timeout=5).strip().split('\t')
        require(len(version_record)==2 and version_record[0]==package and bool(version_record[1]),'OCR_RUNTIME_PACKAGE_VERSION_UNBOUND')
        copyright_path=(pathlib.Path('/usr/share/doc')/package.split(':')[0]/'copyright').resolve(strict=True)
        copyright_identity=raw_identity(copyright_path)
        copyright_relative='copyright/'+package.replace(':','_')+'-copyright'
        shutil.copyfile(copyright_path,prefix/copyright_relative)
        require(raw_identity(prefix/copyright_relative)==copyright_identity,'OCR_RUNTIME_COPYRIGHT_MISMATCH')
        packages[package]={'name':package,'version':version_record[1],
                           'copyright':{'archive_path':copyright_relative,**copyright_identity}}
pins={'tesseract_source_commit':'64eab6c457b2337dd690746a5fde5c222b40d5f8',
      'leptonica_source_commit':'7e803e73511fbd320f01314c141d35d2b8491dde',
      'language_source_commit':'87416418657359cb625c412a48b6e1d6d41c29bd'}
(prefix/'source-pins.json').write_text(json.dumps(pins,sort_keys=True,indent=2)+'\n')
(prefix/'runtime-packages.json').write_text(json.dumps(list(packages.values()),sort_keys=True,indent=2)+'\n')
selected=[executable,language,prefix/'source-pins.json',prefix/'runtime-packages.json',
          *sorted((prefix/'licenses').iterdir()),*sorted((prefix/'runtime').iterdir()),*sorted((prefix/'copyright').iterdir())]
for path in selected:
    path.chmod(0o555 if path==executable else 0o444)
for path in [prefix/'bin',prefix/'share/tessdata',prefix/'share',prefix/'licenses',prefix/'runtime',prefix/'copyright']:
    path.chmod(0o555)
with archive_path.open('xb') as stream,tarfile.open(fileobj=stream,mode='w:gz') as archive:
    for path in selected:
        archive.add(path,arcname=path.relative_to(prefix).as_posix(),recursive=False)
receipt={'schema':'xiio.hex.ocr-toolchain/v1','source_commit':os.environ['GITHUB_SHA'],
         'source_tree':subprocess.check_output(['git','rev-parse','HEAD^{tree}'],text=True).strip(),
         'github_run_id':os.environ['GITHUB_RUN_ID'],'github_run_attempt':os.environ['GITHUB_RUN_ATTEMPT'],
         **pins,'version_first_line':version.splitlines()[0],'version_full':version,
         'executable':{'path':str(executable),**raw_identity(executable),'archive_path':'bin/tesseract'},
         'language':{'path':str(language),**raw_identity(language),'git_blob':git_blob(language),
                     'archive_path':'share/tessdata/eng.traineddata'},
         'runtime_files':runtime,'runtime_packages':list(packages.values()),
         'archive':{'file':archive_path.name,**raw_identity(archive_path)},
         'static_ocr_libraries':True,'supported_input':'PNG','provider_effect':False,'pop_os_acceptance':False}
with identity_path.open('x') as stream: json.dump(receipt,stream,sort_keys=True,indent=2);stream.write('\n')
require(json.loads(identity_path.read_text())==receipt,'OCR_IDENTITY_READBACK_MISMATCH')
for row in runtime:
    require(raw_identity(pathlib.Path(row['resolved_path']))=={key:row[key] for key in ('bytes','sha256')},'OCR_RUNTIME_CHANGED')
identity_path.chmod(0o444)
print('HEX_OCR_TOOLCHAIN_BOUND_NOT_NATIVE_ACCEPTANCE')
with pathlib.Path(os.environ['GITHUB_ENV']).open('a') as stream:
    stream.write('HEX_OCR_BINDING='+str(identity_path)+'\n')
    stream.write('HEX_OCR_BINDING_SHA256='+raw_identity(identity_path)['sha256']+'\n')
PY
