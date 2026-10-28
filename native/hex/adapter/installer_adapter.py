#!/usr/bin/env python3
"""Finite local installer candidate. CLI owns generation and pointer transactions.
Kernel OperationJournal owns outcomes. Plan JSON is immutable approval metadata,
not another installation ledger. No service control, network or credential use.
"""
import sys, os, json, hashlib, stat, subprocess, tempfile, uuid, datetime, fcntl
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / 'kernel'))
sys.path.insert(0, str(HERE))
import connection_profile
import child_bundle
import install_preflight
import local_step_actions
from xiio_installer.observability import OperationJournal, inspect_operation
SOURCE = HERE.parent / 'cli-source'
AVAILABILITY = {'cli': {'available': True, 'required': True, 'required_dependencies':['switchboard-native-consumer']}, 'bins': {'available': False, 'reason': 'PACKAGED_ARTIFACT_UNQUALIFIED'}, 'switchboard': {'available': False, 'reason': 'PACKAGED_ARTIFACT_UNQUALIFIED'}}
class Refused(Exception): pass
def demand(v, message):
    if not v: raise Refused(message)
def digest(b): return hashlib.sha256(b).hexdigest()
def canonical(v): return json.dumps(v, sort_keys=True, separators=(',', ':')).encode()
def safe_path(p):
    p = Path(p)
    demand(p.is_absolute() and '\x00' not in str(p) and '..' not in p.parts, 'ABSOLUTE_SAFE_PATH_REQUIRED')
    for q in [p, *p.parents]: demand(not q.is_symlink(), 'SYMLINK_PATH_REFUSED')
    return p
def file_bytes(p):
    safe_path(p); s=p.stat()
    demand(stat.S_ISREG(s.st_mode) and s.st_nlink==1, 'REGULAR_UNSHARED_FILE_REQUIRED')
    return p.read_bytes()
def tree(p):
    safe_path(p)
    if not p.exists(): return None
    demand(p.is_dir(), 'DESTINATION_NOT_DIRECTORY')
    result={}
    for f in sorted(p.rglob('*')):
        safe_path(f); st=f.stat(); rel=str(f.relative_to(p))
        demand(len(result)<2048, 'DESTINATION_TOO_LARGE')
        if f.is_dir(): result[rel]={'kind':'dir','mode':stat.S_IMODE(st.st_mode)}
        else:
            demand(st.st_size<32*1024*1024, 'DESTINATION_FILE_TOO_LARGE')
            result[rel]={'kind':'file','sha256':digest(file_bytes(f)),'mode':stat.S_IMODE(st.st_mode)}
    return result
def env(home=None):
    h=str(home or Path.home())
    return {'PATH':'/usr/bin:/bin','HOME':h,'LANG':'C.UTF-8','XIIO_CONFIG_DIR':h+'/config','XDG_CONFIG_HOME':h+'/config','XDG_DATA_HOME':h+'/data','XDG_STATE_HOME':h+'/state','XDG_CACHE_HOME':h+'/cache'}
def run(argv, timeout=60):
    with tempfile.TemporaryDirectory(prefix='xiio-installer-check-') as h:
        r=subprocess.run(argv, input='', text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env(h), cwd=h, timeout=timeout)
    demand(len(r.stdout)<1024*1024 and len(r.stderr)<1024*1024,'CHILD_OUTPUT_TOO_LARGE')
    demand(r.returncode==0, 'CLI_OPERATION_FAILED: '+r.stdout[-1500:]+r.stderr[-500:])
    return r.stdout

def node_identity(raw):
    p=Path(raw)
    demand(p.is_absolute(),'NODE_ABSOLUTE_REQUIRED')
    p=p.resolve(strict=True)
    b=file_bytes(p)
    version=run([str(p),'--version'],10).strip()
    bits=version.lstrip('v').split('.')
    demand(len(bits)==3 and all(x.isdigit() for x in bits),'NODE_VERSION_INVALID')
    demand(tuple(map(int,bits)) >= (22,13,0),'NODE_22_13_REQUIRED')
    return {'path':str(p),'sha256':digest(b),'version':version}
def payload():
    m=json.loads(file_bytes(SOURCE/'packaged-source.json'))
    demand(m['schema']=='xiio.cli.packaged-source/v1','PAYLOAD_SCHEMA_INVALID')
    for f,e in m['files'].items():
        b=file_bytes(SOURCE/f); demand(digest(b)==e['sha256'] and len(b)==e['size'],'PAYLOAD_CHANGED')
    return {'manifest':m,'manifest_sha256':digest(file_bytes(SOURCE/'packaged-source.json')),'installer_sha256':digest(file_bytes(SOURCE/'install.mjs'))}
def observed_preflight():
    observation=install_preflight.preflight()
    try:
        source=connection_profile.custody(SOURCE/'connection')
        observation['connection_payload']={'available':True,'required':True,'source_ref':source['ref'],'source_files':len(source['files'])}
    except (OSError,ValueError,KeyError,TypeError):
        observation['connection_payload']={'available':False,'required':True,'state':'BUNDLED_CONNECTION_SOURCE_UNQUALIFIED'}
    return observation
def root():
    # System environment supplies only the owner's ordinary XDG state location.
    p=safe_path(Path(os.environ.get('XDG_STATE_HOME',str(Path.home()/'.local/state')))/'xi-io/installer')
    p.mkdir(parents=True,exist_ok=True,mode=0o700)
    safe_path(p); return p

def save_plan(base,p):
    d=base/'native-plans'; d.mkdir(mode=0o700,exist_ok=True); safe_path(d)
    f=d/(p['plan_id']+'.json')
    fd=os.open(f,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'wb') as out: out.write(canonical(p));out.flush();os.fsync(out.fileno())
def load_plan(base,ident):
    demand(isinstance(ident,str) and len(ident)==32 and all(c in '0123456789abcdef' for c in ident),'PLAN_ID_INVALID')
    p=json.loads(file_bytes(base/'native-plans'/(ident+'.json')))
    value=dict(p);claimed=value.pop('approval_digest',None)
    demand(claimed==digest(canonical(value)) and p['plan_id']==ident,'PLAN_DIGEST_MISMATCH')
    return p

def observation(base,p,action):
    try: return inspect_operation(p['plan_id']+'-'+action,root=base)
    except Exception:
        if (base/'operations'/(p['plan_id']+'-'+action+'.jsonl')).exists(): raise Refused('EVIDENCE_UNREADABLE_DO_NOT_RETRY')
        return None

def project(base,p):
    if p.get('kind')=='launcher_repair':return repair_project(base,p)
    out=dict(p);out['component_availability']=AVAILABILITY;out['supported_components']=AVAILABILITY;out['receipt_directory']=str(base/'operations')
    a=observation(base,p,'apply');r=observation(base,p,'rollback')
    out['rollback_available']=False
    if r:
        out['phase']='ROLLED_BACK' if r['final_state']=='rolled_back' else 'ROLLBACK_OUTCOME_UNCERTAIN'
        out['do_not_retry']=r['final_state']!='rolled_back'
    elif a:
        out['phase']='INSTALLED_READBACK_VERIFIED' if a['final_state']=='passed' else 'APPLY_OUTCOME_UNCERTAIN'
        out['do_not_retry']=a['final_state']!='passed'
        if a['final_state']=='passed': out['rollback_available']=bool(p.get('previous_current'))
    else: out['phase']='PREPARED_NOT_INSTALLED';out['do_not_retry']=False
    return out

def verify_node(p):
    demand(digest(file_bytes(Path(p['node']['path'])))==p['node']['sha256'],'NODE_CHANGED_SINCE_REVIEW')
    demand(node_identity(p['node']['path'])==p['node'],'NODE_CHANGED_SINCE_REVIEW')

def installed(p, expected_sha=None, expected_generation=None):
    prefix=Path(p['prefix']); current=file_bytes(prefix/'current').decode().strip()
    demand('/' not in current and current not in ('','.','..'),'GENERATION_INVALID')
    if expected_generation: demand(current==expected_generation,'INSTALLED_GENERATION_CHANGED')
    verify_node(p)
    receipt_bytes=file_bytes(prefix/'versions'/current/'install-receipt.json')
    receipt=json.loads(receipt_bytes)
    demand(receipt.get('source_sha')==(expected_sha or p['payload']['manifest']['source_sha']),'INSTALLED_SOURCE_MISMATCH')
    demand(receipt.get('prefix')==str(prefix),'INSTALLED_PREFIX_MISMATCH')
    for f,h in receipt['files'].items():
        demand(f in p['payload']['manifest']['files'],'INSTALLED_FILE_UNEXPECTED')
        demand(digest(file_bytes(prefix/'versions'/current/f))==h,'INSTALLED_BYTES_CHANGED')
        expected=p['payload']['manifest']['files'][f]['sha256'] if not expected_sha else p['destination_before']['versions/'+current+'/'+f]['sha256']
        demand(h==expected,'INSTALLED_PAYLOAD_NOT_REVIEWED')
    if expected_sha:
        # Rollback has its own reviewed denominator: never require yesterday's
        # six-file generation to contain today's newly added payload module.
        demand(current==p.get('previous_current'),'ROLLBACK_GENERATION_NOT_REVIEWED')
        reviewed=p['destination_before'].get('versions/'+current+'/install-receipt.json',{})
        demand(digest(receipt_bytes)==reviewed.get('sha256'),'ROLLBACK_RECEIPT_NOT_REVIEWED')
    else:
        demand(set(receipt['files'])==set(p['payload']['manifest']['files']),'INSTALLED_FILES_INCOMPLETE')
    launcher=prefix/'bin/xi-io-cli'
    quote=lambda s: "'"+s.replace("'", "'\"'\"'")+"'"
    expected_launcher='#!/bin/sh\n# xi-io-cli launcher written by install.mjs; the generation is chosen by current\nP='+quote(str(prefix))+'\nexec '+quote(p['node']['path'])+' "$P/versions/$(cat "$P/current")/src/xiio.mjs" "$@"\n'
    demand(file_bytes(launcher)==expected_launcher.encode(),'LAUNCHER_CHANGED')
    result=json.loads(run([str(launcher),'version']))
    demand(result.get('integrity_verified') is True and result.get('source_sha')==receipt['source_sha'],'CLI_VERSION_NOT_VERIFIED')
    return {'generation':current,'source_sha':receipt['source_sha'],'files':receipt['files'],'launcher_sha256':digest(file_bytes(launcher)),'version_readback':result}

# Exact upstream PR15 launcher-only path, packaged beside (not replacing) the
# offline transport adaptation. These hashes are authority, not mutable metadata.
REPAIR_REF='0f2b444abbe8f7a99c5f4520b1222c568eba6dd1'
REPAIR_INSTALLER='launcher-repair.install.mjs'
REPAIR_SHA256='61fd09c0d0de09fb2b3aec4e94b34d013cd35ddc60eb44f86443a5d2b5812a4d'
REPAIR_VERIFY_SHA256='de15e26e26ad52c1bab3fd3fc7a0a389bec3c8dbe6a06666f51de075a0dd4912'

def repair_source():
    installer=file_bytes(SOURCE/REPAIR_INSTALLER)
    demand(digest(installer)==REPAIR_SHA256,'REPAIR_SOURCE_NOT_EXACT_PR15')
    demand(digest(file_bytes(SOURCE/'launcher-repair.runtime-integrity.mjs'))==REPAIR_VERIFY_SHA256,'REPAIR_VERIFIER_NOT_EXACT_PR15')
    return {'ref':REPAIR_REF,'resource':REPAIR_INSTALLER,'sha256':REPAIR_SHA256,'size':len(installer),'verifier_sha256':REPAIR_VERIFY_SHA256,'modified':False}

def repair_history(prefix,node):
    # Call the unchanged, hash-qualified upstream verifier. Never execute the
    # existing launcher or installed generation during preparation/approval.
    script="""import {pathToFileURL} from 'node:url';
const [resource,prefix]=process.argv.slice(1);
const {readGenerationPointer,verifyGeneration,pointerTransactionPending}=await import(pathToFileURL(resource));
if(pointerTransactionPending(prefix))throw Error('POINTER_RECOVERY_REQUIRED');
const current=readGenerationPointer(prefix,'current'),previous=readGenerationPointer(prefix,'previous');
if(!current)throw Error('CURRENT_GENERATION_MISSING');
const receipts={current:verifyGeneration(prefix,current),previous:previous?verifyGeneration(prefix,previous):null};
console.log(JSON.stringify({current,previous,receipts}));"""
    return json.loads(run([node['path'],'--input-type=module','--eval',script,str(SOURCE/'launcher-repair.runtime-integrity.mjs'),str(prefix)],30))

def repair_node(raw):
    n=node_identity(raw)
    actual=json.loads(run([n['path'],'--input-type=module','--eval',"console.log(JSON.stringify({path:process.execPath,version:'v'+process.versions.node}))"],10))
    demand(actual=={'path':n['path'],'version':n['version']},'ACTUAL_NODE_IDENTITY_NOT_VERIFIED')
    return n

def repair_expected_launcher(prefix,node):
    # Independent read-only assertion of the qualified installer's exact output.
    # This function never writes a launcher; canonical PR15 alone owns effects.
    quote=lambda value: "'"+value.replace("'", "'\\'"+"'")+"'"
    return ('#!/bin/sh\n# xi-io-cli launcher written by install.mjs; the generation is chosen by current\nP='+quote(prefix)+'\nexec '+quote(node)+' "$P/versions/$(cat "$P/current")/src/xiio.mjs" "$@"\n').encode()

def repair_launcher(path):
    b=file_bytes(path);s=path.stat()
    demand(s.st_uid==os.getuid() and not (s.st_mode&0o022) and s.st_mode&0o111 and not(s.st_mode&0o7000) and len(b)<=8192,'LAUNCHER_FILE_UNTRUSTED')
    return {'sha256':digest(b),'size':len(b),'mode':stat.S_IMODE(s.st_mode),'uid':s.st_uid,'gid':s.st_gid,'dev':s.st_dev,'ino':s.st_ino}

def repair_bin(path):
    safe_path(path);s=path.stat()
    demand(stat.S_ISDIR(s.st_mode) and s.st_uid==os.getuid() and not(s.st_mode&0o002),'LAUNCHER_DIRECTORY_UNTRUSTED')
    return {'mode':stat.S_IMODE(s.st_mode),'uid':s.st_uid,'gid':s.st_gid,'dev':s.st_dev,'ino':s.st_ino}

def repair_pending(path):
    # Canonical transaction artifacts are owned by the canonical installer only.
    # Never clear a lock, infer owner death, or overwrite an interrupted repair.
    demand(not any(path.parent.glob(path.name+'.repair-*')),'CANONICAL_LAUNCHER_RECOVERY_REQUIRED_NO_RETRY')

def repair_snapshot(p):
    # Preserve the entire prefix, including both receipts and every generation.
    # Only the selected launcher and its exact canonical backup are excluded if
    # the user explicitly selected a launcher located inside the CLI prefix.
    rows=tree(Path(p['prefix']));demand(rows is not None,'EXISTING_CLI_REQUIRED')
    for raw in [p['launcher'],p['backup']]:
        try: rows.pop(str(Path(raw).relative_to(p['prefix'])),None)
        except ValueError: pass
    return rows

def repair_unresolved(base,prefix,launcher,except_plan=None):
    # A new plan is not a way around an old incomplete OperationJournal.
    files=list((base/'native-plans').glob('*.json'))
    demand(len(files)<=2048,'TOO_MANY_PLANS_REVIEW_REQUIRED')
    for f in files:
        if f.stem==except_plan:continue
        prior=load_plan(base,f.stem)
        if prior.get('kind')!='launcher_repair':continue
        if prior.get('prefix')!=str(prefix) and prior.get('launcher')!=str(launcher):continue
        op=observation(base,prior,'apply_repair')
        demand(not op or op['final_state']=='passed','UNRESOLVED_REPAIR_OUTCOME_DO_NOT_RETRY')

def repair_project(base,p):
    out=dict(p);out.update(receipt_directory=str(base/'operations'),rollback_available=False,connected=False,full_cli_acceptance=False)
    op=observation(base,p,'apply_repair')
    out['phase']='PREPARED_REPAIR_NOT_APPLIED' if not op else ('LAUNCHER_REPAIR_READBACK_VERIFIED' if op['final_state']=='passed' else 'LAUNCHER_REPAIR_OUTCOME_UNCERTAIN')
    out['do_not_retry']=bool(op and op['final_state']!='passed')
    out['recovery_required']=out['do_not_retry']
    if out['do_not_retry']:
        out['recovery']={'owner':'canonical_cli_installer','automatic':False,'installer':str(SOURCE/REPAIR_INSTALLER),'node':p['node']['path'],'prefix':p['prefix'],'bin_dir':p['bin_dir'],'original_launcher_sha256':p['original_launcher_sha256'],'instruction':'Review saved OperationJournal and canonical repair intent. Explicit recovery must use this exact canonical installer; do not repeat apply or prepare another plan.'}
    return out

def prepare_repair(req,base):
    demand(sys.platform.startswith('linux'),'LAUNCHER_REPAIR_PLATFORM_NOT_QUALIFIED')
    prefix=safe_path(req['prefix']);bin_dir=safe_path(req['bin_dir']);launcher=bin_dir/'xi-io-cli'
    demand(len(prefix.parts)>=3 and prefix!=Path.home(),'DEDICATED_DESTINATION_REQUIRED')
    demand(not(prefix==base or prefix in base.parents or base in prefix.parents),'DESTINATION_EVIDENCE_OVERLAP')
    demand(not(bin_dir==base or bin_dir in base.parents or base in bin_dir.parents),'LAUNCHER_EVIDENCE_OVERLAP')
    repair_unresolved(base,prefix,launcher);repair_pending(launcher)
    source=repair_source();node=repair_node(req['node']);directory=repair_bin(bin_dir);original=repair_launcher(launcher)
    backup=str(launcher)+'.pre-v1-'+original['sha256'][:12]
    if os.path.lexists(backup):demand(digest(file_bytes(Path(backup)))==original['sha256'],'LAUNCHER_BACKUP_CONFLICT')
    p={'kind':'launcher_repair','plan_id':uuid.uuid4().hex,'prefix':str(prefix),'bin_dir':str(bin_dir),'launcher':str(launcher),'backup':backup,'node':node,'repair_source':source,'launcher_directory_before':directory,'launcher_before':original,'original_launcher_sha256':original['sha256'],'created_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'components':['cli'],'changes':['Repair only the explicitly selected existing CLI launcher with exact PR15 installer','Pin the verified existing Node executable; preserve original launcher in canonical backup'],'limitations':['No runtime download or replacement CLI generation','No pointer, receipt, payload, connection or service changes','Launcher version verification only; not doctor, local-read or complete CLI acceptance','Interrupted outcomes require explicitly reviewed canonical recovery; no automatic retry']}
    before=repair_snapshot(p);history=repair_history(prefix,node)
    demand(repair_snapshot(p)==before and repair_launcher(launcher)==original and repair_bin(bin_dir)==directory,'REPAIR_TARGET_CHANGED_DURING_REVIEW')
    demand(repair_source()==source,'REPAIR_SOURCE_CHANGED_DURING_REVIEW')
    p['expected_launcher_sha256']=digest(repair_expected_launcher(str(prefix),node['path']))
    p.update(preservation_before=before,preservation_digest=digest(canonical(before)),preserved_generation=history,payload_files=0,payload_bytes=0)
    p['approval_digest']=digest(canonical(p));save_plan(base,p)
    return repair_project(base,p)

def repair_readback(p,expected_launcher_sha):
    verify_node(p);demand(repair_source()==p['repair_source'],'REPAIR_SOURCE_CHANGED_SINCE_REVIEW')
    demand(repair_bin(Path(p['bin_dir']))==p['launcher_directory_before'],'LAUNCHER_DIRECTORY_CHANGED_SINCE_REVIEW')
    repair_pending(Path(p['launcher']))
    demand(repair_snapshot(p)==p['preservation_before'],'REPAIR_PRESERVATION_DRIFT')
    history=repair_history(Path(p['prefix']),p['node']);demand(history==p['preserved_generation'],'REPAIR_GENERATION_HISTORY_CHANGED')
    demand(expected_launcher_sha==p['expected_launcher_sha256'],'CANONICAL_LAUNCHER_DIGEST_UNEXPECTED')
    demand(file_bytes(Path(p['launcher']))==repair_expected_launcher(p['prefix'],p['node']['path']),'REPAIRED_LAUNCHER_BYTES_UNEXPECTED')
    launcher=repair_launcher(Path(p['launcher']));demand(launcher['sha256']==expected_launcher_sha,'REPAIRED_LAUNCHER_CHANGED')
    demand(all(launcher[k]==p['launcher_before'][k] for k in ['mode','uid','gid']),'REPAIRED_LAUNCHER_METADATA_CHANGED')
    demand(digest(file_bytes(Path(p['backup'])))==p['original_launcher_sha256'],'ORIGINAL_LAUNCHER_BACKUP_CHANGED')
    actual=json.loads(run([p['launcher'],'version'],30))
    receipt=history['receipts']['current']
    legacy=receipt['source_sha'] in {'385c85d53f99ac2f9e6c4fecb6d3c76ee772590d','16d0fb4101d0674f8bd57858ac04d7fabf02aed2'}
    if legacy:
        want={'schema':'xiio.cli.version/v1','product':'xi-io: CLI','source_sha':receipt['source_sha'],'ref':receipt['ref'],'generation':history['current'],'current':history['current'],'previous':history['previous'],'platform':sys.platform,'running_file_sha256':receipt['files']['src/xiio.mjs'],'receipt_file_sha256':receipt['files']['src/xiio.mjs']}
        version_verified=all(actual.get(k)==v for k,v in want.items()) and 'state' not in actual and 'integrity_verified' not in actual
    else:
        version_verified=actual.get('state')=='PASS' and actual.get('integrity_verified') is True and actual.get('generation')==history['current']
    demand(version_verified,'ACTUAL_LAUNCHER_VERSION_NOT_VERIFIED')
    demand(actual.get('source_sha')==history['receipts']['current']['source_sha'],'ACTUAL_LAUNCHER_SOURCE_MISMATCH')
    demand(repair_snapshot(p)==p['preservation_before'] and repair_launcher(Path(p['launcher']))==launcher,'REPAIR_READBACK_CONCURRENT_CHANGE')
    return {'generation':history['current'],'previous':history['previous'],'source_sha':actual['source_sha'],'launcher':p['launcher'],'launcher_sha256':launcher['sha256'],'version_readback':actual,'history_unchanged':True,'actual_launcher_version_verified':True,'doctor_and_local_read_verified':False,'full_cli_acceptance':False}

def repair_uncertain_observation(base,p,view):
    # Diagnostics only. Never execute the launcher, resolve an intent, amend a
    # journal, or promote an uncertain operation on the strength of file presence.
    observed={'effects_authorized':False,'recovery_performed':False,'errors':[]}
    def check(name,fn):
        try: observed[name]=fn()
        except Exception as e: observed['errors'].append({'check':name,'error':str(e)[:512]})
    check('launcher',lambda:repair_launcher(Path(p['launcher'])))
    live=observed.get('launcher',{}).get('sha256')
    observed['launcher_bytes']='ORIGINAL' if live==p['original_launcher_sha256'] else ('EXPECTED_REPAIR' if live==p['expected_launcher_sha256'] else ('DIFFERENT' if live else 'UNOBSERVED'))
    check('backup_matches_original',lambda:digest(file_bytes(Path(p['backup'])))==p['original_launcher_sha256'])
    check('generation_history_bytes_unchanged',lambda:repair_snapshot(p)==p['preservation_before'])
    check('node_bytes_unchanged',lambda:digest(file_bytes(Path(p['node']['path'])))==p['node']['sha256'])
    check('repair_source_unchanged',lambda:repair_source()==p['repair_source'])
    check('canonical_artifacts',lambda:sorted(x.name for x in Path(p['launcher']).parent.glob(Path(p['launcher']).name+'.repair-*'))[:64])
    op=observation(base,p,'apply_repair')
    observed['recorded_outcome']=op['final_state'] if op else None
    observed['recorded_failure']=(op['events'][-1].get('details',{}).get('failure') if op else None)
    return {**view,'uncertain_observation':observed,'observation_current':False,'full_cli_acceptance':False,'do_not_retry':True,'recovery_required':True}

def handle_repair(req,base,p):
    act=req['action'];view=repair_project(base,p)
    if act=='inspect':return view
    if act=='readback':
        if view['phase']=='PREPARED_REPAIR_NOT_APPLIED':return view
        if view['do_not_retry']:return repair_uncertain_observation(base,p,view)
        op=observation(base,p,'apply_repair')
        rb=repair_readback(p,op['events'][-1]['details'].get('launcher_sha256'))
        return {**view,'readback':rb,'observation_current':True}
    demand(act=='apply_repair','REPAIR_PLAN_ACTION_MISMATCH')
    demand(req.get('approved') is True and req.get('approval_digest')==p['approval_digest'],'EXACT_APPROVAL_REQUIRED')
    demand(not view['do_not_retry'],'UNCERTAIN_REPAIR_OUTCOME_DO_NOT_RETRY')
    demand(view['phase']=='PREPARED_REPAIR_NOT_APPLIED','DUPLICATE_REPAIR_REFUSED')
    repair_unresolved(base,p['prefix'],p['launcher'],p['plan_id'])
    verify_node(p);demand(repair_source()==p['repair_source'],'REPAIR_SOURCE_CHANGED_SINCE_REVIEW')
    demand(repair_bin(Path(p['bin_dir']))==p['launcher_directory_before'],'LAUNCHER_DIRECTORY_CHANGED_SINCE_REVIEW')
    repair_pending(Path(p['launcher']))
    demand(repair_launcher(Path(p['launcher']))==p['launcher_before'],'LAUNCHER_CHANGED_SINCE_REVIEW')
    demand(repair_snapshot(p)==p['preservation_before'],'REPAIR_PRESERVATION_CHANGED_SINCE_REVIEW')
    demand(repair_history(Path(p['prefix']),p['node'])==p['preserved_generation'],'REPAIR_HISTORY_CHANGED_SINCE_REVIEW')
    if os.path.lexists(p['backup']):demand(digest(file_bytes(Path(p['backup'])))==p['original_launcher_sha256'],'LAUNCHER_BACKUP_CONFLICT')
    journal=OperationJournal('native-cli-installer','apply_repair',operation_id=p['plan_id']+'-apply_repair',correlation_id=p['plan_id'],root=base)
    journal.start('Repair only exact reviewed existing CLI launcher',details={'approval_digest':p['approval_digest'],'repair_source_sha256':REPAIR_SHA256,'preservation_digest':p['preservation_digest']})
    try:
        # Sole mutation owner. No --ref/--packaged-source, fetch or generation
        # staging path is reachable. The exact installer owns backup and recovery.
        # No adapter deadline may kill this consequential child at a durable
        # transaction boundary. The carrier bounds response waiting, retains
        # process custody/gating, and leaves this owner to record the outcome.
        result=json.loads(run([p['node']['path'],str(SOURCE/REPAIR_INSTALLER),'--repair-launcher','--prefix',p['prefix'],'--bin-dir',p['bin_dir'],'--expect-launcher-sha256',p['original_launcher_sha256']],None))
        demand(result.get('schema')=='xiio.cli.launcher-repair/v1' and result.get('state')=='LAUNCHER_VERSION_VERIFIED' and result.get('history_unchanged') is True and result.get('actual_launcher_version_verified') is True,'CANONICAL_REPAIR_NOT_VERIFIED')
        demand(result.get('generation')==p['preserved_generation']['current'] and result.get('previous')==p['preserved_generation']['previous'] and result.get('previous_launcher_sha256')==p['original_launcher_sha256'] and result.get('backup')==p['backup'],'CANONICAL_REPAIR_RESULT_MISMATCH')
        rb=repair_readback(p,result.get('launcher_sha256'))
        journal.finish('passed','Actual launcher version verified; complete prefix history preserved',expected_action='apply_repair',details={'approval_digest':p['approval_digest'],'launcher_sha256':rb['launcher_sha256'],'preservation_digest':p['preservation_digest'],'generation':rb['generation'],'repair_source_sha256':REPAIR_SHA256})
        return {**repair_project(base,p),'readback':rb,'observation_current':True}
    except Exception as error:
        try:journal.finish('unknown','Launcher repair execution or readback uncertain; canonical recovery requires review',expected_action='apply_repair',details={'approval_digest':p['approval_digest'],'repair_source_sha256':REPAIR_SHA256,'failure':str(error)[:2048]})
        except Exception:pass
        raise Refused('REPAIR_OUTCOME_UNCERTAIN_CANONICAL_RECOVERY_REQUIRED_DO_NOT_RETRY')

def _bundle_operation_prefix(profile):
    return 'bundle-'+profile['profile_id']+'-'+profile['lock_sha256'][:16]+'-apply'

def _bundle_attempts(base,profile):
    directory=base/'operations'
    if not directory.exists():return []
    demand(not directory.is_symlink() and directory.is_dir(),'BUNDLE_OPERATION_JOURNAL_ROOT_INVALID')
    prefix=_bundle_operation_prefix(profile)+'-'
    files=sorted(directory.glob(prefix+'*.jsonl'))
    demand(len(files)<=64,'BUNDLE_OPERATION_HISTORY_REVIEW_REQUIRED')
    out=[]
    for file in files:
        suffix=file.stem[len(prefix):]
        demand(suffix.isdigit() and int(suffix)>0,'BUNDLE_OPERATION_ID_INVALID')
        try: observed=inspect_operation(file.stem,root=base)
        except Exception: raise Refused('BUNDLE_EVIDENCE_UNREADABLE_DO_NOT_RETRY')
        out.append((int(suffix),observed))
    return sorted(out,key=lambda row:row[0])

def _bundle_projection(base,lock,profile,custody=None):
    if custody is None:
        try:
            with child_bundle.bundle_inspection_custody(
                lock, approved_lock_sha256=profile['lock_sha256']
            ) as observed:
                return _bundle_projection(base,lock,profile,custody=observed)
        except child_bundle.BundleError as error:
            if str(error) == 'BUNDLE_APPLY_IN_PROGRESS':
                return {'phase':'APPLY_IN_PROGRESS','profile_id':profile['profile_id'],
                        'components':list(profile['ordered_roles']),'lock_sha256':profile['lock_sha256'],
                        'downloadable':True,'installable':False,'retry_allowed':False,'do_not_retry':True,
                        'receipt_count':0,'first_red':'BUNDLE_APPLY_IN_PROGRESS','attempts':[],
                        'authority_granted':False,'device_connected':False,'child_services_started':False}
            raise
    try:
        installed=child_bundle.inspect_bundle_install(
            lock,approved_lock_sha256=profile['lock_sha256'],custody=custody)
    except Exception:
        installed={'state':'OUTCOME_UNCERTAIN','first_red':'BUNDLE_READBACK_FAILED','receipt_count':0}
    attempts=_bundle_attempts(base,profile)
    summaries=[{'attempt':n,'operation_id':o['operation_id'],'final_state':o['final_state'],'incomplete':o['incomplete'],'journal_sha256':o['journal_sha256']} for n,o in attempts]
    state=installed['state']
    if state=='INSTALLED_BYTES_VERIFIED': phase='INSTALLED_BYTES_VERIFIED'
    elif state=='APPLY_IN_PROGRESS': phase='APPLY_IN_PROGRESS'
    elif state=='OUTCOME_UNCERTAIN': phase='APPLY_OUTCOME_UNCERTAIN'
    elif attempts: phase='RECONCILED_NOT_INSTALLED'
    else: phase='REVIEW_REQUIRED'
    # Preserve inspection when the journal cap is exhausted; never admit a
    # 65th operation that would make future inspection/reconciliation fail.
    exhausted=len(attempts)>=64
    retry_safe=state=='NOT_INSTALLED' and not exhausted
    first_red=('BUNDLE_OPERATION_HISTORY_REVIEW_REQUIRED' if exhausted and state=='NOT_INSTALLED'
               else installed.get('first_red'))
    return {'phase':phase,'profile_id':profile['profile_id'],'components':list(profile['ordered_roles']),
            'lock_sha256':profile['lock_sha256'],'downloadable':True,'installable':retry_safe,
            'retry_allowed':retry_safe,'do_not_retry':not retry_safe,'receipt_count':installed.get('receipt_count',0),
            'first_red':first_red,'attempts':summaries,
            'authority_granted':False,'device_connected':False,'child_services_started':False}

def _next_bundle_operation(base,profile):
    attempts=_bundle_attempts(base,profile)
    demand(len(attempts)<64,'BUNDLE_OPERATION_HISTORY_REVIEW_REQUIRED')
    number=(max((n for n,_ in attempts),default=0)+1)
    return _bundle_operation_prefix(profile)+'-'+str(number)

def handle(req):
    demand(isinstance(req,dict),'REQUEST_OBJECT_REQUIRED')
    # Bundle lock ships as a read-only source projection beside this adapter.
    # Neither caller paths nor caller-supplied manifest bytes can redirect the
    # native installer to another release. Product release artifacts are owned
    # by the separate canonical product publishers.
    if req.get('action') in ('bundle_inspect','bundle_apply'):
        if set(req) - ({'action'} if req['action']=='bundle_inspect' else
                      {'action','lock_sha256','approved'}):
            raise Refused('REQUEST_FIELDS_INVALID')
        lock=HERE/'core-release.lock.json'
        if not lock.is_file() or lock.is_symlink():
            if req['action']=='bundle_inspect':
                return {'phase':'BLOCKED_RELEASE_PROFILE_UNPUBLISHED',
                        'missing_roles':sorted(child_bundle.BASELINE_ROLES),
                        'downloadable':False,'installable':False,
                        'authority_granted':False,'device_connected':False,
                        'child_services_started':False}
            raise Refused('BUNDLE_RELEASE_PROFILE_UNPUBLISHED')
        profile=child_bundle.load_bundle_profile(lock)
        demand(not profile['fixture'],'BUNDLE_FIXTURE_NOT_INSTALLABLE')
        base=root()
        if req['action']=='bundle_inspect':
            return _bundle_projection(base,lock,profile)
        demand(req.get('approved') is True and
               req.get('lock_sha256')==profile['lock_sha256'],
               'BUNDLE_EXACT_REVIEW_AND_APPROVAL_REQUIRED')
        try:
            with child_bundle.bundle_apply_custody(
                lock, approved_lock_sha256=profile['lock_sha256']
            ) as custody:
                projection=_bundle_projection(base,lock,profile,custody=custody)
                demand(projection.get('first_red')!='BUNDLE_OPERATION_HISTORY_REVIEW_REQUIRED',
                       'BUNDLE_OPERATION_HISTORY_REVIEW_REQUIRED')
                demand(projection['retry_allowed'] is True,
                       'BUNDLE_OUTCOME_UNCERTAIN_OR_ALREADY_INSTALLED_DO_NOT_RETRY')
                operation_id=_next_bundle_operation(base,profile)
                journal=OperationJournal('native-core-bundle','bundle_apply',operation_id=operation_id,
                                         correlation_id='bundle-'+profile['profile_id']+'-'+profile['lock_sha256'][:16],root=base)
                journal.start('Install exact reviewed core release bundle',details={'profile_id':profile['profile_id'],'lock_sha256':profile['lock_sha256']})
                try:
                    # Cross-process custody is already held before retry
                    # classification and remains held through acquisition,
                    # installation, exact readback and journal finalization.
                    result=child_bundle.install_bundle(
                        lock,approved_lock_sha256=profile['lock_sha256'],custody=custody)
                    readback=_bundle_projection(base,lock,profile,custody=custody)
                    demand(readback['phase']=='INSTALLED_BYTES_VERIFIED','BUNDLE_POST_APPLY_READBACK_FAILED')
                    journal.finish('passed','Exact child receipts and installed bytes verified',expected_action='bundle_apply',
                                   changed_resources=[{'kind':'bundle','profile_id':profile['profile_id'],'lock_sha256':profile['lock_sha256']}],
                                   rollback_eligible=True,details={'receipt_count':readback['receipt_count'],'lock_sha256':profile['lock_sha256']})
                    return {**result,'operation_id':operation_id,'journaled':True}
                except Exception as error:
                    readback=_bundle_projection(base,lock,profile,custody=custody)
                    if readback['phase']=='RECONCILED_NOT_INSTALLED':
                        try: journal.finish('failed','Bundle effect failed and exact destination readback is clean',expected_action='bundle_apply',
                                            failure_category='BUNDLE_APPLY_FAILED_ROLLED_BACK',rollback_eligible=False,
                                            rollback_result='verified_not_installed',recommended_next_action='Review failure before a fresh approved attempt',
                                            details={'lock_sha256':profile['lock_sha256']})
                        except Exception: pass
                        raise Refused('BUNDLE_APPLY_FAILED_ROLLED_BACK')
                    try: journal.finish('unknown','Bundle outcome is uncertain; receipts and destination bytes require reconciliation',expected_action='bundle_apply',
                                        failure_category='BUNDLE_OUTCOME_UNCERTAIN',rollback_eligible=None,
                                        recommended_next_action='Run bundle_inspect and do not retry until exact receipts/bytes reconcile',
                                        details={'lock_sha256':profile['lock_sha256']})
                    except Exception: pass
                    raise Refused('BUNDLE_OUTCOME_UNCERTAIN_DO_NOT_RETRY') from error
        except child_bundle.BundleError as error:
            if str(error) == 'BUNDLE_APPLY_ALREADY_IN_PROGRESS':
                raise Refused('BUNDLE_APPLY_ALREADY_IN_PROGRESS') from error
            raise
    allowed={'inspect':{'action','plan_id'},'prepare':{'action','prefix','node','components'},'prepare_repair':{'action','prefix','node','bin_dir'},'apply_repair':{'action','plan_id','approval_digest','approved'},'readback':{'action','plan_id'},'apply':{'action','plan_id','approval_digest','approved'},'rollback':{'action','plan_id','approval_digest','approved'},'local_ai_status':{'action','plan_id'},'safe_task_inspect':{'action','plan_id'},'safe_task_prepare':{'action','plan_id','workspace'},'safe_task_apply':{'action','plan_id','proof_id','approval_digest','approved'}}
    act=req.get('action');demand(act in allowed and set(req)<=allowed[act],'REQUEST_FIELDS_INVALID')
    base=root();lock=base/'native-adapter.lock'
    fd=os.open(lock,os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600)
    try:
        try: fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError: raise Refused('INSTALLER_BUSY')
        if act=='inspect' and 'plan_id' not in req:
            plans=[]
            for f in sorted((base/'native-plans').glob('*.json'))[-20:]:
                try: plans.append(project(base,load_plan(base,f.stem)))
                except Exception: plans.append({'plan_id':f.stem,'phase':'EVIDENCE_UNREADABLE_DO_NOT_RETRY','do_not_retry':True})
            return {'plans':plans,'component_availability':AVAILABILITY,'supported_components':AVAILABILITY,'prefix_suggestion':str(Path.home()/'.local/share/xi-io/cli-v1'),'bin_dir_suggestion':str(Path.home()/'.local/bin'),**observed_preflight()}
        if act=='prepare_repair':return prepare_repair(req,base)
        if act=='prepare':
            demand(req.get('components')==['cli'],'ONLY_QUALIFIED_CLI_COMPONENT_AVAILABLE')
            prefix=safe_path(req['prefix']);demand(len(prefix.parts)>=3 and prefix!=Path.home(),'DEDICATED_DESTINATION_REQUIRED')
            demand(not (prefix==base or prefix in base.parents or base in prefix.parents),'DESTINATION_EVIDENCE_OVERLAP')
            before=tree(prefix)
            # Never overwrite arbitrary existing applications. Existing CLI generations only.
            previous=None
            if before:
                demand((prefix/'current').is_file() and (prefix/'versions').is_dir(),'DESTINATION_NOT_EXISTING_CLI')
                previous=file_bytes(prefix/'current').decode().strip()
            n=node_identity(req['node']);pack=payload();ident=uuid.uuid4().hex
            p={'plan_id':ident,'prefix':str(prefix),'node':n,'components':['cli'],'payload':pack,'destination_before':before,'previous_current':previous,'payload_files':len(pack['manifest']['files']),'payload_bytes':sum(x['size'] for x in pack['manifest']['files'].values()),'created_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'changes':['Install exact CLI generation','Create/retain pinned Node launcher in selected prefix/bin','Commit existing CLI current/previous pointers'],'limitations':['No service startup','No remote connection','No first-install uninstall; rollback is existing CLI previous-generation swap']}
            p['preflight']=observed_preflight()
            p['connection_prerequisites']=p['preflight']['connection_prerequisites']
            p['connection']=connection_profile.prepare(base,p,SOURCE/'connection')
            p['payload_files']+=p['connection']['payload_files'];p['payload_bytes']+=p['connection']['payload_bytes']
            p['changes'].append('Install required pinned Switchboard native consumer and finite xi-io-connect launcher; no enrollment or startup')
            if previous:
                old=json.loads(file_bytes(prefix/'versions'/previous/'install-receipt.json'));p['previous_source_sha']=old['source_sha']
            p['approval_digest']=digest(canonical(p));save_plan(base,p)
            return project(base,p)
        p=load_plan(base,req.get('plan_id'));view=project(base,p)
        if p.get('kind')=='launcher_repair':return handle_repair(req,base,p)
        demand(act!='apply_repair','INSTALL_PLAN_ACTION_MISMATCH')
        if act=='inspect': return view
        if act=='safe_task_inspect':return local_step_actions.handle(req,base,p,None)
        if act in ['local_ai_status','safe_task_prepare','safe_task_apply']:
            demand(view['phase']=='INSTALLED_READBACK_VERIFIED' and not view['do_not_retry'],'VERIFIED_INSTALLED_CLI_REQUIRED')
            op=observation(base,p,'apply')
            demand(digest(canonical(tree(Path(p['prefix']))))==op['events'][-1]['details'].get('destination_tree_digest'),'INSTALLED_STATE_DRIFT')
            rb=installed(p,expected_generation=op['events'][-1]['details'].get('generation'))
            return local_step_actions.handle(req,base,p,rb)
        if act=='readback':
            if view['phase']=='PREPARED_NOT_INSTALLED':return view
            # Incomplete journal cannot be erased by apparently correct files.
            demand(not view['do_not_retry'],'INCOMPLETE_OPERATION_REQUIRES_RECONCILIATION_NO_RETRY')
            op=observation(base,p,'rollback' if view['phase']=='ROLLED_BACK' else 'apply')
            demand(digest(canonical(tree(Path(p['prefix']))))==op['events'][-1]['details'].get('destination_tree_digest'),'INSTALLED_STATE_DRIFT')
            generation=op['events'][-1]['details'].get('generation')
            rb=installed(p,p.get('previous_source_sha') if view['phase']=='ROLLED_BACK' else None,generation)
            cr=connection_profile.readback(base,p,SOURCE/'connection',op['events'][-1]['details'].get('connection_receipt_sha256'),view['phase']=='ROLLED_BACK')
            return {**view,'readback':rb,'connection_readback':cr,'connection_state':'CONFIGURATION_REQUIRED','connected':False,'observation_current':True}
        demand(req.get('approved') is True and req.get('approval_digest')==p['approval_digest'],'EXACT_APPROVAL_REQUIRED')
        demand(not view['do_not_retry'],'UNCERTAIN_OUTCOME_DO_NOT_RETRY')
        verify_node(p)
        demand(payload()==p['payload'],'PAYLOAD_CHANGED_SINCE_REVIEW')
        connection_profile.validate(base,p,SOURCE/'connection',act=='apply')
        if act=='apply':
            demand(view['phase']=='PREPARED_NOT_INSTALLED','DUPLICATE_APPLY_REFUSED')
            demand(tree(Path(p['prefix']))==p['destination_before'],'DESTINATION_CHANGED_SINCE_REVIEW')
        else:
            demand(view['phase']=='INSTALLED_READBACK_VERIFIED' and p.get('previous_current'),'NO_PREVIOUS_GENERATION_ROLLBACK_UNAVAILABLE')
            aop=observation(base,p,'apply')
            demand(digest(canonical(tree(Path(p['prefix']))))==aop['events'][-1]['details'].get('destination_tree_digest'),'INSTALLED_STATE_DRIFT')
            installed(p,expected_generation=aop['events'][-1]['details'].get('generation'))
            demand(file_bytes(Path(p['prefix'])/'previous').decode().strip()==p['previous_current'],'ROLLBACK_TARGET_CHANGED')
            connection_profile.readback(base,p,SOURCE/'connection',aop['events'][-1]['details'].get('connection_receipt_sha256'))
        journal=OperationJournal('native-cli-installer',act,operation_id=p['plan_id']+'-'+act,correlation_id=p['plan_id'],root=base)
        journal.start('Apply exact reviewed CLI generation' if act=='apply' else 'Restore previous CLI generation',details={'approval_digest':p['approval_digest']})
        connection_receipt=None
        try:
            if act=='apply':
                connection_receipt=connection_profile.apply(base,p,SOURCE/'connection')
                result=json.loads(run([p['node']['path'],str(SOURCE/'install.mjs'),'--packaged-source',str(SOURCE),'--ref',p['payload']['manifest']['source_sha'],'--prefix',p['prefix'],'--bin-dir',str(Path(p['prefix'])/'bin')],90))
                demand(result.get('state')=='PASS','INSTALLER_RESULT_NOT_PASS')
            else:
                result=json.loads(run([str(Path(p['prefix'])/'bin/xi-io-cli'),'rollback']))
                demand(result.get('state')=='PASS','ROLLBACK_RESULT_NOT_PASS')
                connection_receipt={'receipt_sha256':aop['events'][-1]['details']['connection_receipt_sha256']}
                connection_profile.revert(base,p,SOURCE/'connection',connection_receipt['receipt_sha256'])
            rb=installed(p,p.get('previous_source_sha') if act=='rollback' else None)
            cr=connection_profile.readback(base,p,SOURCE/'connection',connection_receipt['receipt_sha256'],act=='rollback')
            journal.finish('passed' if act=='apply' else 'rolled_back','CLI generation and independent version readback verified',expected_action=act,details={'generation':rb['generation'],'source_sha':rb['source_sha'],'approval_digest':p['approval_digest'],'destination_tree_digest':digest(canonical(tree(Path(p['prefix'])))),'connection_receipt_sha256':connection_receipt['receipt_sha256']})
            return {**project(base,p),'readback':rb,'connection_readback':cr,'connection_state':'CONFIGURATION_REQUIRED','connected':False,'observation_current':True}
        except Exception:
            connection_recovery='NOT_ATTEMPTED'
            if act=='apply' and connection_receipt:
                try:
                    cur=Path(p['prefix'])/'current'
                    current=file_bytes(cur).decode().strip() if cur.exists() else None
                    if current==p.get('previous_current'):
                        connection_profile.revert(base,p,SOURCE/'connection',connection_receipt['receipt_sha256'])
                        connection_recovery='ROLLED_BACK_PRIOR_CLI_POINTER_PRESERVED'
                    else: connection_recovery='UNKNOWN_CLI_POINTER_CHANGED_PRESERVE_FOR_RECONCILIATION'
                except Exception: connection_recovery='ROLLBACK_UNCERTAIN'
            # No retry: install may have staged bytes or committed pointers.
            try: journal.finish('unknown','Execution or evidence uncertain; reconcile before retry',expected_action=act,details={'approval_digest':p['approval_digest'],'connection_recovery':connection_recovery})
            except Exception: pass
            raise Refused('OUTCOME_UNCERTAIN_CHECK_SAVED_STATE_DO_NOT_RETRY')
    finally: os.close(fd)

def main():
    try:
        raw=sys.stdin.buffer.read(16385);demand(len(raw)<=16384,'REQUEST_TOO_LARGE')
        result=handle(json.loads(raw)); response={'ok':True,'result':result}
    except Exception as e: response={'ok':False,'error':str(e)[:2048]}
    encoded=json.dumps(response,separators=(',',':'))+'\n'
    if len(encoded.encode())>2*1024*1024: encoded=json.dumps({'ok':False,'error':'RESPONSE_TOO_LARGE_CHECK_SAVED_STATE'})+'\n'
    sys.stdout.write(encoded)
if __name__=='__main__': main()
