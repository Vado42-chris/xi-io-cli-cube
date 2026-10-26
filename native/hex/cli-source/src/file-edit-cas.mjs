// XI-IO CLI local edit commit guard. This is NOT a Ward grant or BINS lease.
// A single-host cooperative lock serializes writers that use this guard;
// expected source bytes and SHA prevent stale edits and lost local updates.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const sha256=b=>crypto.createHash('sha256').update(b).digest('hex');
function regular(file){
  let st;
  try { st=fs.lstatSync(file); } catch(error){
    if(error?.code==='ENOENT')throw Error('FILE_CHANGED_SINCE_APPROVAL');
    throw error;
  }
  if(!st.isFile()||st.isSymbolicLink())throw Error('NOT_A_REGULAR_FILE');
  if(st.nlink!==1)throw Error('HARDLINK_WRITE_REFUSED');
  return st;
}
function lockedBytes(file,st){
  const flags=fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0);
  const fd=fs.openSync(file,flags);
  try{
    const before=fs.fstatSync(fd);
    if(before.dev!==st.dev||before.ino!==st.ino||!before.isFile()||before.nlink!==1)
      throw Error('FILE_CHANGED_SINCE_APPROVAL');
    const bytes=fs.readFileSync(fd);
    const after=fs.fstatSync(fd);
    if(before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs)
      throw Error('FILE_CHANGED_DURING_EDIT');
    return bytes;
  }finally{fs.closeSync(fd);}
}
export function commitWorkspaceEditCAS({file,expectedBytes,nextBytes,expectedSha256=null}={}){
  if(typeof file!=='string'||!path.isAbsolute(file))throw Error('EDIT_TARGET_NOT_ABSOLUTE');
  if(!Buffer.isBuffer(expectedBytes)||!Buffer.isBuffer(nextBytes))throw Error('EDIT_BYTES_REQUIRED');
  if(expectedSha256!==null&&(!/^[0-9a-f]{64}$/.test(expectedSha256)||sha256(expectedBytes)!==expectedSha256))
    throw Error('EDIT_EXPECTED_SHA256_INVALID');
  const lock=path.join(path.dirname(file),'.'+path.basename(file)+'.xiio-write.lock');
  let lockFd=null,lockIdentity=null,temp=null;
  try{
    try { lockFd=fs.openSync(lock,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|(fs.constants.O_NOFOLLOW||0),0o600); }
    catch(error){if(error?.code==='EEXIST')throw Error('FILE_WRITE_LOCK_HELD');throw error;}
    lockIdentity=fs.fstatSync(lockFd);
    const initial=regular(file);
    const actual=lockedBytes(file,initial);
    if(!actual.equals(expectedBytes)||expectedSha256!==null&&sha256(actual)!==expectedSha256)
      throw Error('FILE_CHANGED_SINCE_APPROVAL');
    temp=path.join(path.dirname(file),'.'+path.basename(file)+'.xiio-'+process.pid+'-'+crypto.randomBytes(8).toString('hex')+'.tmp');
    const tmpFd=fs.openSync(temp,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|(fs.constants.O_NOFOLLOW||0),initial.mode&0o777);
    try{fs.writeFileSync(tmpFd,nextBytes);fs.fsyncSync(tmpFd);}finally{fs.closeSync(tmpFd);}
    const tempBytes=fs.readFileSync(temp);
    if(!tempBytes.equals(nextBytes))throw Error('EDIT_STAGING_READBACK_MISMATCH');
    const now=regular(file);
    if(now.dev!==initial.dev||now.ino!==initial.ino||!lockedBytes(file,now).equals(expectedBytes))
      throw Error('FILE_CHANGED_SINCE_APPROVAL');
    fs.renameSync(temp,file);temp=null;
    const readback=fs.readFileSync(file);
    if(!readback.equals(nextBytes))throw Error('EDIT_READBACK_MISMATCH');
    return Object.freeze({
      state:'LOCAL_CAS_COMMITTED',guard:'SAME_HOST_COOPERATIVE_FILE_LOCK',
      sha256_before:sha256(expectedBytes),sha256_after:sha256(readback),
      bytes_before:expectedBytes.length,bytes_after:readback.length,
      readback_matches:true,bins_version_qualified:false,ward_authority_granted:false
    });
  }finally{
    if(temp)try{fs.rmSync(temp,{force:true});}catch{}
    if(lockFd!==null){
      fs.closeSync(lockFd);
      try{const st=fs.lstatSync(lock);if(st.dev===lockIdentity.dev&&st.ino===lockIdentity.ino)fs.unlinkSync(lock);}catch{}
    }
  }
}
