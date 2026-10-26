#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C
[[ "$(id -u)" != 0 ]] || { echo "Run as your normal user, not root."; exit 1; }
[[ "$(uname -s)" == Linux && "$(dpkg --print-architecture)" == amd64 ]] || { echo "Linux amd64 required."; exit 1; }
for tool in curl sha256sum dpkg-deb dpkg dpkg-query apt-get pgrep awk mktemp python3; do command -v "$tool" >/dev/null || { echo "Missing requirement: $tool"; exit 1; }; done
if pgrep -x xi-io-hex-dev >/dev/null 2>&1; then
 echo "Close XI-IO HEX DEV first, then rerun. No process was stopped."; exit 1
else
 status=$?
 [[ "$status" == 1 ]] || { echo "Cannot establish whether HEX is running; stopped."; exit 1; }
fi
work="$(mktemp -d "/tmp/xiio-hex-dev6.XXXXXXXX")"
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
guard="$work/apt-guard.py"
cat >"$guard" <<'XIIO_GUARD'
#!/usr/bin/python3
"""APT v3 pre-dpkg guard: validate actual actions, not the prior simulation."""
import hashlib, os, stat, sys
from pathlib import Path
PACKAGE='xi-io-hex-dev'
VERSION='0.1.0-dev.6'
SHA='7f2aa8af513adde056a687c98dd8e53fa27e78b27d75c7ead2ad582c8f5a85f3'
def check(raw, old_version, digest_file):
    if len(raw)>2*1024*1024: raise ValueError('APT_ACTIONS_TOO_LARGE')
    lines=raw.decode('utf-8',errors='strict').splitlines()
    if not lines or lines[0]!='VERSION 3': raise ValueError('APT_PROTOCOL_3_REQUIRED')
    try: start=lines.index('',1)+1
    except ValueError: raise ValueError('APT_CONFIG_TERMINATOR_MISSING')
    actions=lines[start:]
    if not actions or len(actions)>8: raise ValueError('APT_ACTION_COUNT_INVALID')
    for line in actions:
        fields=line.split(' ',8)
        if len(fields)!=9 or any(not f for f in fields): raise ValueError('APT_ACTION_MALFORMED')
        name,old,oldarch,oldmulti,direction,new,newarch,newmulti,action=fields
        if name!=PACKAGE or new!=VERSION or newarch!='amd64' or newmulti not in ('none','no'): raise ValueError('UNAPPROVED_PACKAGE_ACTION')
        if old!=(old_version or '-') or oldarch not in ('amd64','-') or direction not in ('<','='): raise ValueError('PACKAGE_STATE_CHANGED_SINCE_APPROVAL')
        if action=='**CONFIGURE**': continue
        if action.startswith('**') or not action.startswith('/'): raise ValueError('UNAPPROVED_ACTION_KIND')
        if digest_file(action)!=SHA: raise ValueError('ACTUAL_PACKAGE_BYTES_CHANGED')
    return len(actions)
def digest_file(path):
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    try:
        before=os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or before.st_size!=6664296: raise ValueError('ACTUAL_PACKAGE_FILE_INVALID')
        h=hashlib.sha256()
        while True:
            b=os.read(fd,1024*1024)
            if not b: break
            h.update(b)
        after=os.fstat(fd)
        if (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,before.st_ctime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns):raise ValueError('ACTUAL_PACKAGE_CHANGED_DURING_READ')
        return h.hexdigest()
    finally: os.close(fd)
if __name__=='__main__':
    try:
        if len(sys.argv)!=1 or os.environ.get('APT_HOOK_INFO_FD')!='0':raise ValueError('APT_HOOK_BINDING_UNVERIFIED')
        old=(Path(__file__).parent/'approved-version').read_text().strip()
        if len(old)>128 or any(c not in '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.+:~_-' for c in old):raise ValueError('APPROVED_VERSION_INVALID')
        n=check(sys.stdin.buffer.read(2*1024*1024+1),old,digest_file)
        print('XIIO_ACTUAL_APT_ACTIONS_VERIFIED: '+str(n),file=sys.stderr)
    except Exception as e:
        print('XIIO_APT_GUARD_REFUSED: '+str(e),file=sys.stderr);sys.exit(73)
XIIO_GUARD
chmod 500 "$guard"
printf '%s\n' "$installed" >"$work/approved-version"
hook="$guard"
# The final action list is checked while APT owns its transaction lock.
# No global apt configuration is written or cleared.
sudo apt-get -o DPkg::Lock::Timeout=0 -o Debug::NoLocking=false \
  -o APT::Get::Assume-Yes=false -o quiet=0 -o DPkg::ConfigurePending=false \
  -o "DPkg::Pre-Install-Pkgs::=$hook" \
  -o "DPkg::Tools::Options::$hook::Version=3" \
  -o "DPkg::Tools::Options::$hook::InfoFD=0" \
  --no-remove install "$deb"
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

