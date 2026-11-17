#!/usr/bin/env python3
# Native finite adapter for XI-IO HEX. No shell, no sudo, no package manager.
import datetime,fcntl,hashlib,json,os,re,shutil,stat,subprocess,sys,tempfile,uuid
from pathlib import Path
HERE=Path(__file__).resolve().parent
KERNEL=HERE/'kernel';sys.path.insert(0,str(KERNEL));sys.path.insert(0,str(HERE))
from xiio_installer.discovery import xdg_roots
from xiio_installer.observability import OperationJournal,inspect_operation
from xiio_installer.transaction import TransactionError,plan_install,qualify_precommand_install_plans,qualify_precommand_targets
import connection_profile,install_preflight,local_step_actions,permission_profile,service_profile,server_profile
SOURCE=HERE.parent/'cli-source'
REPAIR_SOURCE=HERE.parent.parent.parent/'tests'/'fixtures'/'cli-launcher-repair-pr15'
SUPPORTED=['cli'];AVAILABILITY={'cli':'available','bins':'unavailable','ibal':'unavailable','desktop':'unavailable'}
SHA=re.compile(r'^[a-f0-9]{40}$');HEX64=re.compile(r'^[a-f0-9]{64}$')
class Refused(Exception):pass
def demand(c,m):
    if not c:raise Refused(m)
def canonical(x):return json.dumps(x,sort_keys=True,separators=(',',':')).encode()
def digest(b):return hashlib.sha256(b).hexdigest()
def file_bytes(p):
    demand(p.is_file() and not p.is_symlink(),'SOURCE_FILE_INVALID:'+str(p));return p.read_bytes()
def tree(p):
    if not p.exists():return None
    demand(p.is_dir() and not p.is_symlink(),'DESTINATION_INVALID')
    out={}
    for f in sorted(p.rglob('*')):
        demand(not f.is_symlink(),'DESTINATION_SYMLINK_FORBIDDEN')
        if f.is_file():out[str(f.relative_to(p))]={'sha256':digest(f.read_bytes()),'mode':stat.S_IMODE(f.stat().st_mode)}
    return out
def root():
    raw=os.environ.get('XDG_STATE_HOME');p=Path(raw) if raw else Path.home()/'.local/state';p=p/'xi-io/installer'
    p.mkdir(parents=True,exist_ok=True,mode=0o700);demand(not p.is_symlink() and stat.S_IMODE(p.stat().st_mode)&0o077==0,'STATE_ROOT_UNSAFE');return p
def atomic(p,data):
    p.parent.mkdir(parents=True,exist_ok=True,mode=0o700);fd,n=tempfile.mkstemp(dir=p.parent,prefix='.'+p.name+'.')
    try:
        with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
        os.chmod(n,0o600);os.replace(n,p)
    finally:
        if os.path.exists(n):os.unlink(n)
def load_json(p):
    demand(p.is_file() and not p.is_symlink() and p.stat().st_size<=4*1024*1024,'EVIDENCE_FILE_INVALID')
    try:return json.loads(p.read_bytes())
    except Exception:raise Refused('EVIDENCE_JSON_INVALID')
def payload():
    s=load_json(SOURCE/'packaged-source.json');demand(s.get('schema')=='xiio.hex.packaged-source/v1','SOURCE_SCHEMA_INVALID');demand(SHA.fullmatch(str(s.get('accepted_pr12_merge_sha',''))),'SOURCE_SHA_INVALID')
    manifest={}
    for row in s.get('files',[]):
        rel=row.get('path');demand(isinstance(rel,str) and not rel.startswith('/') and '..' not in Path(rel).parts,'SOURCE_PATH_INVALID');b=file_bytes(SOURCE/rel);demand(len(b)==row.get('size') and digest(b)==row.get('sha256'),'SOURCE_CUSTODY_MISMATCH:'+rel);manifest[rel]={'sha256':digest(b),'size':len(b)}
    demand(manifest,'SOURCE_MANIFEST_EMPTY');return {'source_sha':s['accepted_pr12_merge_sha'],'source':s,'manifest':{'files':manifest}}
def node_identity(explicit):
    candidates=[]
    if explicit:candidates.append(Path(explicit))
    candidates += [Path('/usr/bin/node'),Path('/usr/local/bin/node'),Path.home()/'.local/bin/node']
    nv=Path.home()/'.nvm/versions/node'
    if nv.is_dir():candidates += sorted(nv.glob('*/bin/node'),reverse=True)
    for c in candidates:
        try:
            p=c.resolve(strict=True);demand(p.is_file() and os.access(p,os.X_OK),'NODE_NOT_EXECUTABLE')
            r=subprocess.run([str(p),'--version'],capture_output=True,text=True,timeout=5,env={'PATH':'/usr/bin:/bin','HOME':str(Path.home())})
            if r.returncode==0:return {'path':str(p),'version':r.stdout.strip(),'sha256':digest(p.read_bytes())}
        except Exception:continue
    raise Refused('NODE_RUNTIME_NOT_FOUND')
def paths(base,i):return base/'native-plans'/f'{i}.json',base/'native-observations'/f'{i}.json'
def save_plan(base,p):
    a,_=paths(base,p['plan_id']);demand(not a.exists(),'PLAN_ALREADY_EXISTS');atomic(a,canonical(p)+b'\n')
def load_plan(base,i):
    demand(isinstance(i,str) and re.fullmatch(r'[a-f0-9]{32}',i),'PLAN_ID_INVALID');a,_=paths(base,i);p=load_json(a);demand(p.get('plan_id')==i,'PLAN_ID_MISMATCH');return p
def observation(base,p,action):
    _,o=paths(base,p['plan_id']);demand(o.is_file(),'OBSERVATION_MISSING')
    try:x=inspect_operation(o)
    except Exception:raise Refused('OBSERVATION_UNREADABLE')
    demand(x.get('action')==action,'OBSERVATION_ACTION_MISMATCH');return x
def project(base,p):
    prefix=Path(p['prefix']);kind=p.get('kind','install');action='repair' if kind=='launcher_repair' else ('rollback' if p.get('rolled_back_at') else 'apply')
    phase='REPAIR_REVIEW_REQUIRED' if kind=='launcher_repair' else 'REVIEW_REQUIRED'
    retry=True;reason=None
    try:
        _,o=paths(base,p['plan_id'])
        if o.exists():
            q=inspect_operation(o);s=q.get('state')
            if kind=='launcher_repair':
                phase={'running':'REPAIR_IN_PROGRESS','passed':'REPAIR_READBACK_VERIFIED','unknown':'REPAIR_EVIDENCE_UNCERTAIN_DO_NOT_RETRY','failed':'REPAIR_FAILED_DO_NOT_RETRY'}.get(s,'REPAIR_EVIDENCE_UNREADABLE_DO_NOT_RETRY')
            else:phase={'running':'EXECUTION_IN_PROGRESS','passed':'INSTALLED_READBACK_VERIFIED','rolled_back':'ROLLED_BACK_READBACK_VERIFIED','unknown':'EVIDENCE_UNCERTAIN_DO_NOT_RETRY','failed':'EXECUTION_FAILED_DO_NOT_RETRY'}.get(s,'EVIDENCE_UNREADABLE_DO_NOT_RETRY')
            if s in ('unknown','failed'):retry=False;reason='OUTCOME_REQUIRES_RECONCILIATION'
    except Exception:phase='EVIDENCE_UNREADABLE_DO_NOT_RETRY';retry=False;reason='EVIDENCE_UNREADABLE'
    return {**p,'phase':phase,'can_apply':phase in ('REVIEW_REQUIRED','REPAIR_REVIEW_REQUIRED'),'can_rollback':phase=='INSTALLED_READBACK_VERIFIED' and p.get('previous_current') is not None,'do_not_retry':not retry,'reason':reason,'observed_destination':tree(prefix)}
def installed(p,expected_generation=None):
    prefix=Path(p['prefix']);cur=prefix/'current';demand(cur.is_file() and not cur.is_symlink(),'CURRENT_POINTER_MISSING');gen=file_bytes(cur).decode().strip();demand(SHA.fullmatch(gen),'CURRENT_GENERATION_INVALID')
    if expected_generation is not None:demand(gen==expected_generation,'CURRENT_GENERATION_MISMATCH')
    receipt=load_json(prefix/'versions'/gen/'install-receipt.json');demand(receipt.get('source_sha')==gen,'INSTALL_RECEIPT_GENERATION_MISMATCH')
    for rel,meta in p['payload']['manifest']['files'].items():
        f=prefix/'versions'/gen/rel;demand(f.is_file() and not f.is_symlink(),'INSTALLED_FILE_MISSING:'+rel);b=f.read_bytes();demand(len(b)==meta['size'] and digest(b)==meta['sha256'],'INSTALLED_FILE_MISMATCH:'+rel)
    launcher=prefix/'bin/xi-io-cli';demand(launcher.is_file() and not launcher.is_symlink(),'INSTALLED_LAUNCHER_MISSING')
    text=launcher.read_text();demand(str(prefix/'versions'/gen/'src/xiio.mjs') in text,'INSTALLED_LAUNCHER_GENERATION_MISMATCH')
    return {'generation':gen,'source_sha':receipt['source_sha'],'node':p['node'],'launcher_sha256':digest(launcher.read_bytes()),'verified':True}
def observed_preflight():
    p=install_preflight.preflight();return {'local_environment':p['local_environment'],'availability':p['availability'],'connection_prerequisites':p['connection_prerequisites'],'first_red':p['first_red'],'first_red_detail':p['first_red_detail'],'checks':p['checks']}
def repair_source():
    meta=load_json(REPAIR_SOURCE/'SOURCE.json');demand(meta.get('schema')=='xiio.cli.launcher-repair-source/v1','REPAIR_SOURCE_SCHEMA_INVALID')
    accepted=meta.get('accepted');demand(isinstance(accepted,dict),'REPAIR_SOURCE_ACCEPTED_INVALID');demand(accepted.get('pr')==15 and SHA.fullmatch(str(accepted.get('merge_ref',''))),'REPAIR_SOURCE_REF_INVALID')
    files=[]
    for row in accepted.get('files',[]):
        rel=row.get('path');demand(isinstance(rel,str) and not rel.startswith('/') and '..' not in Path(rel).parts,'REPAIR_SOURCE_PATH_INVALID');b=file_bytes(REPAIR_SOURCE/rel);demand(len(b)==row.get('size') and digest(b)==row.get('sha256'),'REPAIR_SOURCE_CUSTODY_MISMATCH:'+rel);files.append({'path':rel,'sha256':row['sha256'],'size':row['size']})
    demand(files,'REPAIR_SOURCE_FILES_EMPTY');return {'merge_ref':accepted['merge_ref'],'files':files,'source':meta}
def launcher_identity(path):
    p=Path(path);demand(p.is_absolute(),'REPAIR_LAUNCHER_PATH_NOT_ABSOLUTE');demand(p.exists() and p.is_file() and not p.is_symlink(),'REPAIR_LAUNCHER_PATH_INVALID');b=p.read_bytes();demand(len(b)<=1024*1024,'REPAIR_LAUNCHER_TOO_LARGE');return {'path':str(p),'sha256':digest(b),'size':len(b),'mode':stat.S_IMODE(p.stat().st_mode),'bytes':b}
def repair_candidate(base,plan,source):
    src=REPAIR_SOURCE/'install.mjs';out=base/'repair-candidates'/plan['plan_id']/'install.mjs';out.parent.mkdir(parents=True,exist_ok=True,mode=0o700);atomic(out,file_bytes(src));os.chmod(out,0o500)
    return {'path':str(out),'sha256':digest(out.read_bytes()),'size':out.stat().st_size}
def prepare_repair(req,base):
    demand(req.get('prefix') is not None and req.get('node') is not None and req.get('bin_dir') is not None,'REPAIR_PARAMETERS_REQUIRED')
    prefix=Path(req['prefix']).expanduser();demand(prefix.is_absolute(),'REPAIR_PREFIX_NOT_ABSOLUTE');prefix=prefix.resolve(strict=True);demand(prefix.is_dir() and not prefix.is_symlink(),'REPAIR_PREFIX_INVALID')
    bin_dir=Path(req['bin_dir']).expanduser();demand(bin_dir.is_absolute(),'REPAIR_BIN_DIR_NOT_ABSOLUTE');bin_dir=bin_dir.resolve(strict=True);demand(bin_dir.is_dir() and not bin_dir.is_symlink(),'REPAIR_BIN_DIR_INVALID')
    launcher=launcher_identity(bin_dir/'xi-io-cli');demand(Path(launcher['path']).parent==bin_dir,'REPAIR_LAUNCHER_PARENT_MISMATCH')
    n=node_identity(req['node']);source=repair_source();ident=uuid.uuid4().hex
    p={'kind':'launcher_repair','plan_id':ident,'prefix':str(prefix),'bin_dir':str(bin_dir),'launcher_path':launcher['path'],'launcher_before_sha256':launcher['sha256'],'launcher_before_size':launcher['size'],'launcher_before_mode':launcher['mode'],'node':n,'repair_source':{'accepted_pr':15,'merge_ref':source['merge_ref'],'files':source['files']},'created_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'changes':['Repair only '+launcher['path'],'Preserve installed CLI generation and all other files'],'limitations':['No CLI generation install or rollback','No provider or network configuration','No sudo, service, shell or package-manager effects']}
    candidate=repair_candidate(base,p,source);p['candidate']=candidate;p['approval_digest']=digest(canonical(p));save_plan(base,p);return project(base,p)
def repair_result(path):
    p=Path(path);demand(p.is_file() and not p.is_symlink() and p.stat().st_size<=1024*1024,'REPAIR_RESULT_FILE_INVALID')
    try:r=json.loads(p.read_bytes())
    except Exception:raise Refused('REPAIR_RESULT_JSON_INVALID')
    demand(isinstance(r,dict) and r.get('schema')=='xiio.cli.launcher-repair-result/v1','REPAIR_RESULT_SCHEMA_INVALID');return r
def handle_repair(req,base,p):
    act=req.get('action');demand(act in ('apply_repair','inspect'),'REPAIR_PLAN_ACTION_MISMATCH')
    if act=='inspect':return project(base,p)
    demand(req.get('approved') is True,'EXPLICIT_APPROVAL_REQUIRED');demand(req.get('approval_digest')==p.get('approval_digest'),'APPROVAL_DIGEST_MISMATCH')
    demand(project(base,p)['phase']=='REPAIR_REVIEW_REQUIRED','REPAIR_PLAN_NOT_APPLICABLE')
    current=launcher_identity(p['launcher_path']);demand(current['sha256']==p['launcher_before_sha256'] and current['size']==p['launcher_before_size'] and current['mode']==p['launcher_before_mode'],'REPAIR_LAUNCHER_CHANGED_SINCE_REVIEW')
    candidate=Path(p['candidate']['path']);demand(candidate.is_file() and not candidate.is_symlink(),'REPAIR_CANDIDATE_MISSING');demand(digest(candidate.read_bytes())==p['candidate']['sha256'] and candidate.stat().st_size==p['candidate']['size'],'REPAIR_CANDIDATE_CUSTODY_MISMATCH')
    _,obs=paths(base,p['plan_id']);journal=OperationJournal(obs,p['plan_id'],'repair',p['approval_digest']);journal.begin('Approved launcher-only repair')
    try:
        cmd=[p['node']['path'],str(candidate),'--repair-launcher','--prefix',p['prefix'],'--bin-dir',p['bin_dir'],'--expect-launcher-sha256',p['launcher_before_sha256'],'--repair-receipt-file',str(base/'repair-results'/f"{p['plan_id']}.json")]
        env={'PATH':'/usr/bin:/bin','HOME':str(Path.home()),'XDG_STATE_HOME':str(base.parent.parent),'XIIO_CLI_SKIP_NPM_INSTALL':'1','LANG':'C','LC_ALL':'C'}
        r=subprocess.run(cmd,capture_output=True,text=True,timeout=90,env=env);demand(r.returncode==0,'REPAIR_EXECUTION_FAILED')
        result=repair_result(base/'repair-results'/f"{p['plan_id']}.json");after=launcher_identity(p['launcher_path'])
        demand(result.get('plan')=='launcher_repair' and result.get('launcher_path')==p['launcher_path'],'REPAIR_RESULT_IDENTITY_MISMATCH');demand(result.get('before_sha256')==p['launcher_before_sha256'] and result.get('after_sha256')==after['sha256'],'REPAIR_RESULT_DIGEST_MISMATCH');demand(result.get('after_size')==after['size'] and result.get('after_mode')==after['mode'],'REPAIR_RESULT_METADATA_MISMATCH');demand(result.get('source_ref')==p['repair_source']['merge_ref'],'REPAIR_RESULT_SOURCE_MISMATCH')
        journal.finish('passed','Launcher repair and independent readback verified',expected_action='repair',details={'approval_digest':p['approval_digest'],'before_sha256':p['launcher_before_sha256'],'after_sha256':after['sha256'],'source_ref':p['repair_source']['merge_ref']});return {**project(base,p),'repair_readback':{k:v for k,v in after.items() if k!='bytes'},'source_ref':p['repair_source']['merge_ref']}
    except Exception:
        try:journal.finish('unknown','Repair execution or evidence uncertain; reconcile before retry',expected_action='repair',details={'approval_digest':p['approval_digest']})
        except Exception:pass
        raise Refused('REPAIR_OUTCOME_UNCERTAIN_CHECK_SAVED_STATE_DO_NOT_RETRY')

def _commit_permission_state(base,p,act):
    if act=='apply':
        grant=permission_profile.save_grant(
            base,p['plan_id'],p['permission_profile'],True)
        return {'permission_state':'GRANT_READBACK_VERIFIED',
                'permission_digest':grant['permission_digest']}
    current=permission_profile.load_grant(base,p['plan_id'])
    grant=permission_profile.replace_grant(
        base,p['plan_id'],current['permission_digest'],{
          'schema':permission_profile.SCHEMA,'profile_id':'revoked-after-rollback',
          'capabilities':[],'service_scopes':[],'update_policy':'off',
          'central_updates':False,'remote_access':False,'revoked':True},True)
    return {'permission_state':'REVOKED_AFTER_ROLLBACK',
            'permission_digest':grant['permission_digest']}

def handle(req):
    demand(isinstance(req,dict),'REQUEST_INVALID')
    allowed={'inspect':{'action','plan_id'},'prepare':{'action','prefix','node','components','permission_profile'},'prepare_repair':{'action','prefix','node','bin_dir'},'apply_repair':{'action','plan_id','approval_digest','approved'},'readback':{'action','plan_id'},'apply':{'action','plan_id','approval_digest','approved'},'rollback':{'action','plan_id','approval_digest','approved'},'permission_replace':{'action','plan_id','current_digest','new_profile','approved'},'central_update_decision':{'action','plan_id','request'},'service_plan':{'action','plan_id','service_ids','service_action'},'service_start':{'action','plan_id','service_ids','service_plan_digest','approved'},'service_stop':{'action','plan_id','service_ids','service_plan_digest','approved'},'server_prepare':{'action','plan_id','package_root'},'server_apply':{'action','plan_id','package_root','server_plan','server_plan_digest','approved'},'server_rollback':{'action','plan_id','server_plan','server_plan_digest','approved'},'hotpatch_prepare':{'action','plan_id','request','package_root'},'hotpatch_apply':{'action','plan_id','request','package_root','server_plan','server_plan_digest','authorization','approved'},'local_ai_status':{'action','plan_id'},'safe_task_inspect':{'action','plan_id'},'safe_task_prepare':{'action','plan_id','workspace'},'safe_task_apply':{'action','plan_id','proof_id','approval_digest','approved'}}
    act=req.get('action');demand(act in allowed and set(req)<=allowed[act],'REQUEST_FIELDS_INVALID')
    base=root();lock=base/'native-adapter.lock'
    fd=os.open(lock,os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600)
    try:
        try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:raise Refused('INSTALLER_BUSY')
        if act=='inspect' and 'plan_id' not in req:
            plans=[]
            for f in sorted((base/'native-plans').glob('*.json'))[-20:]:
                try:plans.append(project(base,load_plan(base,f.stem)))
                except Exception:plans.append({'plan_id':f.stem,'phase':'EVIDENCE_UNREADABLE_DO_NOT_RETRY','do_not_retry':True})
            return {'plans':plans,'component_availability':AVAILABILITY,'supported_components':AVAILABILITY,'prefix_suggestion':str(Path.home()/'.local/share/xi-io/cli-v1'),'bin_dir_suggestion':str(Path.home()/'.local/bin'),**observed_preflight()}
        if act=='prepare_repair':return prepare_repair(req,base)
        if act=='prepare':
            comps=req.get('components');demand(isinstance(comps,list) and comps==['cli'],'ONLY_CLI_AVAILABLE_IN_THIS_BUILD')
            prefix=Path(req.get('prefix','')).expanduser();demand(prefix.is_absolute(),'PREFIX_NOT_ABSOLUTE');prefix=prefix.resolve(strict=False);demand(not (prefix==base or prefix in base.parents or base in prefix.parents),'DESTINATION_EVIDENCE_OVERLAP')
            before=tree(prefix);previous=None
            if before:
                demand((prefix/'current').is_file() and (prefix/'versions').is_dir(),'DESTINATION_NOT_EXISTING_CLI');previous=file_bytes(prefix/'current').decode().strip()
            n=node_identity(req['node']);pack=payload();ident=uuid.uuid4().hex
            permissions=permission_profile.compile_profile(req.get('permission_profile'));permission_profile.require_capability(permissions,'install_files')
            p={'plan_id':ident,'prefix':str(prefix),'node':n,'components':['cli'],'payload':pack,'permission_profile':permissions,'permission_digest':permissions['permission_digest'],'destination_before':before,'previous_current':previous,'payload_files':len(pack['manifest']['files']),'payload_bytes':sum(x['size'] for x in pack['manifest']['files'].values()),'created_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'changes':['Install exact CLI generation','Create/retain pinned Node launcher in selected prefix/bin','Commit existing CLI current/previous pointers'],'limitations':['No service startup in this source generation','No remote connection unless separately granted and implemented','No first-install uninstall; rollback is existing CLI previous-generation swap']}
            p['preflight']=observed_preflight();p['connection_prerequisites']=p['preflight']['connection_prerequisites'];p['connection']=connection_profile.prepare(base,p,SOURCE/'connection');p['payload_files']+=p['connection']['payload_files'];p['payload_bytes']+=p['connection']['payload_bytes'];p['changes'].append('Install required pinned Switchboard native consumer and finite xi-io-connect launcher; no enrollment or startup')
            if previous:
                old=json.loads(file_bytes(prefix/'versions'/previous/'install-receipt.json'));p['previous_source_sha']=old['source_sha']
            p['approval_digest']=digest(canonical(p));save_plan(base,p);return project(base,p)
        p=load_plan(base,req.get('plan_id'));view=project(base,p)
        if p.get('kind')=='launcher_repair':return handle_repair(req,base,p)
        demand(act!='apply_repair','INSTALL_PLAN_ACTION_MISMATCH')
        if act=='inspect':return view
        if act=='permission_replace':return {'permission_profile':permission_profile.replace_grant(base,p['plan_id'],req.get('current_digest'),req.get('new_profile'),req.get('approved')),'effect_authorized':False}
        if act in ['central_update_decision','service_plan','service_start','service_stop']:
            demand(view['phase']=='INSTALLED_READBACK_VERIFIED' and not view['do_not_retry'],'VERIFIED_INSTALLED_CLI_REQUIRED')
            op=observation(base,p,'apply');demand(digest(canonical(tree(Path(p['prefix']))))==op['events'][-1]['details'].get('destination_tree_digest'),'INSTALLED_STATE_DRIFT');installed(p,expected_generation=op['events'][-1]['details'].get('generation'));grant=permission_profile.load_grant(base,p['plan_id'])
            if act=='central_update_decision':return permission_profile.authorize_central_request(grant,req.get('request'))
            service_action=req.get('service_action') if act=='service_plan' else ('start' if act=='service_start' else 'stop');demand(service_action in {'start','stop'},'SERVICE_PLAN_ACTION_REQUIRED')
            catalog=service_profile.load_catalog(SOURCE)
            service_plan=service_profile.compile_service_plan(catalog,grant,req.get('service_ids'),service_action,permission_base=base,permission_plan_id=p['plan_id'])
            service_plan_digest=digest(canonical(service_plan))
            if act=='service_plan':return {**service_plan,'service_plan_digest':service_plan_digest}
            demand(req.get('service_plan_digest')==service_plan_digest,'SERVICE_PLAN_CHANGED_SINCE_REVIEW')
            effect=service_profile.apply_service_action(service_plan,grant,service_action,req.get('approved'),catalog_source_root=SOURCE,permission_base=base)
            return {**effect,'service_plan_digest':service_plan_digest}
        if act in ['server_prepare','server_apply','server_rollback']:
            demand(view['phase']=='INSTALLED_READBACK_VERIFIED' and not view['do_not_retry'],'VERIFIED_INSTALLED_CLI_REQUIRED');op=observation(base,p,'apply');demand(digest(canonical(tree(Path(p['prefix']))))==op['events'][-1]['details'].get('destination_tree_digest'),'INSTALLED_STATE_DRIFT');installed(p,expected_generation=op['events'][-1]['details'].get('generation'));grant=permission_profile.load_grant(base,p['plan_id'])
            if act=='server_prepare':
                plan=server_profile.prepare_server_package(req.get('package_root'),Path.home(),grant);return {**plan,'server_plan_digest':digest(canonical(plan))}
            plan=req.get('server_plan');demand(isinstance(plan,dict),'SERVER_PLAN_REQUIRED');demand(req.get('server_plan_digest')==digest(canonical(plan)),'SERVER_PLAN_DIGEST_MISMATCH')
            receipt=base/'server-receipts'/f"{p['plan_id']}.json"
            if act=='server_apply':return server_profile.apply_server_package(req.get('package_root'),Path.home(),grant,plan,receipt,req.get('approved'))
            return server_profile.rollback_server_package(Path.home(),grant,plan,receipt,req.get('approved'))
        if act in ['hotpatch_prepare','hotpatch_apply']:
            demand(view['phase']=='INSTALLED_READBACK_VERIFIED' and not view['do_not_retry'],'VERIFIED_INSTALLED_CLI_REQUIRED');op=observation(base,p,'apply');demand(digest(canonical(tree(Path(p['prefix']))))==op['events'][-1]['details'].get('destination_tree_digest'),'INSTALLED_STATE_DRIFT');installed(p,expected_generation=op['events'][-1]['details'].get('generation'));grant=permission_profile.load_grant(base,p['plan_id']);decision=permission_profile.authorize_central_request(grant,req.get('request'))
            if act=='hotpatch_prepare':
                plan=server_profile.prepare_server_package(req.get('package_root'),Path.home(),grant);return {'decision':decision,'server_plan':plan,'server_plan_digest':digest(canonical(plan)),'effect_authorized':False}
            authorization=permission_profile.require_effect_authorization(decision,req.get('authorization'),req.get('approved'));plan=req.get('server_plan');demand(isinstance(plan,dict) and req.get('server_plan_digest')==digest(canonical(plan)),'SERVER_PLAN_DIGEST_MISMATCH');effect=server_profile.apply_server_package(req.get('package_root'),Path.home(),grant,plan,base/'server-receipts'/f"{p['plan_id']}.json",True);return {'authorization':authorization,'effect':effect}
        if act in ['local_ai_status','safe_task_inspect','safe_task_prepare','safe_task_apply']:
            demand(view['phase']=='INSTALLED_READBACK_VERIFIED' and not view['do_not_retry'],'VERIFIED_INSTALLED_CLI_REQUIRED');op=observation(base,p,'apply');demand(digest(canonical(tree(Path(p['prefix']))))==op['events'][-1]['details'].get('destination_tree_digest'),'INSTALLED_STATE_DRIFT');installed(p,expected_generation=op['events'][-1]['details'].get('generation'))
            return local_step_actions.handle(act,req,base,p)
        demand(act in ('readback','apply','rollback'),'PLAN_ACTION_MISMATCH')
        if act=='readback':
            demand(view['phase'] in ('INSTALLED_READBACK_VERIFIED','ROLLED_BACK_READBACK_VERIFIED'),'NO_VERIFIED_EXECUTION_TO_READBACK');expected=p.get('previous_source_sha') if view['phase']=='ROLLED_BACK_READBACK_VERIFIED' else p['payload']['source_sha'];rb=installed(p,expected);o=observation(base,p,'rollback' if view['phase'].startswith('ROLLED') else 'apply');demand(digest(canonical(tree(Path(p['prefix']))))==o['events'][-1]['details'].get('destination_tree_digest'),'INSTALLED_STATE_DRIFT');connection_receipt=o['events'][-1]['details'].get('connection_receipt_sha256');demand(HEX64.fullmatch(str(connection_receipt or '')),'CONNECTION_RECEIPT_EVIDENCE_MISSING');cr=connection_profile.readback(base,p,SOURCE/'connection',connection_receipt,view['phase'].startswith('ROLLED'));return {**view,'readback':rb,'connection_readback':cr,'connection_state':'CONFIGURATION_REQUIRED','connected':False,'observation_current':True}
        demand(req.get('approved') is True,'EXPLICIT_APPROVAL_REQUIRED');demand(req.get('approval_digest')==p.get('approval_digest'),'APPROVAL_DIGEST_MISMATCH');expected_phase='INSTALLED_READBACK_VERIFIED' if act=='rollback' else 'REVIEW_REQUIRED';demand(view['phase']==expected_phase,'PLAN_NOT_APPLICABLE:'+view['phase']);demand(tree(Path(p['prefix']))==p['destination_before'] if act=='apply' else True,'DESTINATION_CHANGED_SINCE_REVIEW')
        if act=='rollback':demand(p.get('previous_current') is not None,'FIRST_INSTALL_HAS_NO_ROLLBACK')
        _,obs=paths(base,p['plan_id']);journal=OperationJournal(obs,p['plan_id'],act,p['approval_digest']);journal.begin('Exact approved finite execution');connection_receipt=None
        try:
            cmd=[p['node']['path'],str(SOURCE/'install.mjs'),'--prefix',p['prefix'],'--source-ref',p['payload']['source_sha'],'--expected-manifest-sha256',p['payload']['source']['manifest_sha256'],'--expected-payload-source-sha1',p['payload']['source']['payload_source_sha1'],'--expected-payload-source-sha256',p['payload']['source']['payload_source_sha256'],'--expected-manifest-entry-count',str(p['payload']['source']['manifest_entry_count']),'--expected-manifest-total-bytes',str(p['payload']['source']['manifest_total_bytes']),'--consent-bypass-reason','hex-explicit-reviewed-plan']
            if act=='rollback':cmd+=['--rollback-to',p['previous_current']]
            env={'PATH':'/usr/bin:/bin','HOME':str(Path.home()),'XDG_STATE_HOME':str(base.parent.parent),'XIIO_CLI_SKIP_NPM_INSTALL':'1','LANG':'C','LC_ALL':'C'};r=subprocess.run(cmd,capture_output=True,text=True,timeout=90,env=env);demand(r.returncode==0,'CLI_EXECUTION_FAILED')
            if act=='apply':connection_receipt=connection_profile.apply(base,p,SOURCE/'connection')
            else:
                aop=observation(base,p,'apply');connection_receipt={'receipt_sha256':aop['events'][-1]['details']['connection_receipt_sha256']};connection_profile.revert(base,p,SOURCE/'connection',connection_receipt['receipt_sha256'])
            rb=installed(p,p.get('previous_source_sha') if act=='rollback' else None);cr=connection_profile.readback(base,p,SOURCE/'connection',connection_receipt['receipt_sha256'],act=='rollback');permission_readback=_commit_permission_state(base,p,act);permission_state=permission_readback['permission_state']
            journal.finish('passed' if act=='apply' else 'rolled_back','CLI generation, permission grant, and independent version readback verified',expected_action=act,details={'generation':rb['generation'],'source_sha':rb['source_sha'],'approval_digest':p['approval_digest'],'destination_tree_digest':digest(canonical(tree(Path(p['prefix'])))),'connection_receipt_sha256':connection_receipt['receipt_sha256'],'permission_state':permission_state,'permission_digest':permission_readback['permission_digest']})
            return {**project(base,p),'readback':rb,'connection_readback':cr,**permission_readback,'connection_state':'CONFIGURATION_REQUIRED','connected':False,'observation_current':True}
        except Exception:
            connection_recovery='NOT_ATTEMPTED'
            if act=='apply' and connection_receipt:
                try:
                    cur=Path(p['prefix'])/'current';current=file_bytes(cur).decode().strip() if cur.exists() else None
                    if current==p.get('previous_current'):connection_profile.revert(base,p,SOURCE/'connection',connection_receipt['receipt_sha256']);connection_recovery='ROLLED_BACK_PRIOR_CLI_POINTER_PRESERVED'
                    else:connection_recovery='UNKNOWN_CLI_POINTER_CHANGED_PRESERVE_FOR_RECONCILIATION'
                except Exception:connection_recovery='ROLLBACK_UNCERTAIN'
            try:journal.finish('unknown','Execution or evidence uncertain; reconcile before retry',expected_action=act,details={'approval_digest':p['approval_digest'],'connection_recovery':connection_recovery})
            except Exception:pass
            raise Refused('OUTCOME_UNCERTAIN_CHECK_SAVED_STATE_DO_NOT_RETRY')
    finally:os.close(fd)
def main():
    try:
        raw=sys.stdin.buffer.read(16385);demand(len(raw)<=16384,'REQUEST_TOO_LARGE');result=handle(json.loads(raw));response={'ok':True,'result':result}
    except Exception as e:response={'ok':False,'error':str(e)[:2048]}
    encoded=json.dumps(response,separators=(',',':'))+'\n'
    if len(encoded.encode())>2*1024*1024:encoded=json.dumps({'ok':False,'error':'RESPONSE_TOO_LARGE_CHECK_SAVED_STATE'})+'\n'
    sys.stdout.write(encoded)
if __name__=='__main__':main()
