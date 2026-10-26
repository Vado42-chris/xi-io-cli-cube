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
