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
    receipt=json.loads(file_bytes(prefix/'versions'/current/'install-receipt.json'))
    demand(receipt.get('source_sha')==(expected_sha or p['payload']['manifest']['source_sha']),'INSTALLED_SOURCE_MISMATCH')
    demand(receipt.get('prefix')==str(prefix),'INSTALLED_PREFIX_MISMATCH')
    for f,h in receipt['files'].items():
        demand(f in p['payload']['manifest']['files'],'INSTALLED_FILE_UNEXPECTED')
        demand(digest(file_bytes(prefix/'versions'/current/f))==h,'INSTALLED_BYTES_CHANGED')
        expected=p['payload']['manifest']['files'][f]['sha256'] if not expected_sha else p['destination_before']['versions/'+current+'/'+f]['sha256']
        demand(h==expected,'INSTALLED_PAYLOAD_NOT_REVIEWED')
    demand(set(receipt['files'])==set(p['payload']['manifest']['files']),'INSTALLED_FILES_INCOMPLETE')
    launcher=prefix/'bin/xi-io-cli'
    quote=lambda s: "'"+s.replace("'", "'\"'\"'")+"'"
    expected_launcher='#!/bin/sh\n# xi-io-cli launcher written by install.mjs; the generation is chosen by current\nP='+quote(str(prefix))+'\nexec '+quote(p['node']['path'])+' "$P/versions/$(cat "$P/current")/src/xiio.mjs" "$@"\n'
    demand(file_bytes(launcher)==expected_launcher.encode(),'LAUNCHER_CHANGED')
    result=json.loads(run([str(launcher),'version']))
    demand(result.get('integrity_verified') is True and result.get('source_sha')==receipt['source_sha'],'CLI_VERSION_NOT_VERIFIED')
    return {'generation':current,'source_sha':receipt['source_sha'],'files':receipt['files'],'launcher_sha256':digest(file_bytes(launcher)),'version_readback':result}

def handle(req):
    demand(isinstance(req,dict),'REQUEST_OBJECT_REQUIRED')
    allowed={'inspect':{'action','plan_id'},'prepare':{'action','prefix','node','components'},'readback':{'action','plan_id'},'apply':{'action','plan_id','approval_digest','approved'},'rollback':{'action','plan_id','approval_digest','approved'},'local_ai_status':{'action','plan_id'},'safe_task_inspect':{'action','plan_id'},'safe_task_prepare':{'action','plan_id','workspace'},'safe_task_apply':{'action','plan_id','proof_id','approval_digest','approved'}}
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
            return {'plans':plans,'component_availability':AVAILABILITY,'supported_components':AVAILABILITY,'prefix_suggestion':str(Path.home()/'.local/share/xi-io/cli-v1'),**observed_preflight()}
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
