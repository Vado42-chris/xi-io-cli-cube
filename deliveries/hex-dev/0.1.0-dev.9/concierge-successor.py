#!/usr/bin/env python3
"""Finite concierge orchestration; existing installed CLI/kernel own all effects.
No alternate installer, remote bridge, credential access, model inference or retry.
"""
import argparse, datetime, fcntl, hashlib, importlib.util, json, os, re, select, stat, subprocess, sys, tempfile, time, uuid
from pathlib import Path

BUNDLE = Path('/usr/lib/XI-IO HEX DEV')
REF = '31d6a6f3ca595f3295d65bb2eb6bb85ec8e50a68'
PREVIOUS_REF = '8dff7cd8e05e44031b4eec46ddcb03c9e3ce354f'
ANCESTOR_REF = 'aff03d8181afce44602e3a35d732736bdef6f5d2'
PAYLOAD = BUNDLE/'cli-source'
MANIFEST_SHA = 'e187e39924adec9576d91a9b514af3a0be9478625f990a935a87dea7171fee7b'
INSTALLER_SHA = 'b817d87049e68d5db5dc55aa19a02ec28e8ff43156259807f77709e0b8cb96fd'
ADAPTER_SHA = '4d200d42f653706d138af3a4eba587dff28c98e9f7a7285cf90a2c34efd32794'
CONSUMER_SHA = '284fc73f855550ddb51c3c1042fa2efaddab923cbde084b409479b165698746e'
PROOF = 'XI-IO concierge deterministic local read proof.\nNo model inference is requested by this fixture.\n'
class Stop(Exception): pass

def require(condition, code):
    if not condition: raise Stop(code)
def sha(data): return hashlib.sha256(data).hexdigest()
def canonical(value): return json.dumps(value, sort_keys=True, separators=(',', ':')).encode()
def safe(path):
    path=Path(path)
    require(path.is_absolute() and '..' not in path.parts and all(not x.is_symlink() for x in [path,*path.parents]), 'PATH_CUSTODY_UNVERIFIED')
    return path

def private_file(path, limit=2*1024*1024):
    path=safe(path); st=path.stat()
    require(stat.S_ISREG(st.st_mode) and st.st_nlink==1 and st.st_uid==os.getuid() and not st.st_mode&0o077 and st.st_size<=limit,'PRIVATE_EVIDENCE_CUSTODY_UNVERIFIED')
    return path.read_bytes()

def load_adapter(bundle):
    adapter=safe(bundle/'adapter/installer_adapter.py');st=adapter.stat()
    require(stat.S_ISREG(st.st_mode) and st.st_nlink==1 and not st.st_mode&0o022 and sha(adapter.read_bytes())==ADAPTER_SHA,'INSTALLED_ADAPTER_NOT_PINNED')
    spec=importlib.util.spec_from_file_location('xiio_concierge_installed_adapter',adapter)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module

def snapshot(adapter, path):
    result=adapter.tree(path)
    require(result is not None,'EXISTING_TREE_REQUIRED')
    for rel,row in result.items():
        st=(path/rel).stat();row.update(uid=st.st_uid,gid=st.st_gid,dev=st.st_dev,ino=st.st_ino)
    return result

def protected(adapter, original, base):
    plan_path=base/'native-plans'/(original['plan_id']+'.json')
    journal_path=base/'operations'/(original['plan_id']+'-apply_repair.jsonl')
    def file_custody(path):
        path=safe(Path(path));info=path.stat()
        require(stat.S_ISREG(info.st_mode) and info.st_nlink==1,'PROTECTED_FILE_CUSTODY_UNVERIFIED')
        return {'mode':stat.S_IMODE(info.st_mode),'uid':info.st_uid,'gid':info.st_gid,'dev':info.st_dev,'ino':info.st_ino,'nlink':info.st_nlink,'mtime_ns':info.st_mtime_ns,'size':info.st_size}
    versions=Path(original['prefix'])/'versions'
    strong_versions={}
    for path in sorted(versions.rglob('*')):
        safe(path);s=path.stat()
        strong_versions[str(path.relative_to(versions))]={'mode':stat.S_IMODE(s.st_mode),'uid':s.st_uid,'gid':s.st_gid,'dev':s.st_dev,'ino':s.st_ino,'nlink':s.st_nlink,'mtime_ns':s.st_mtime_ns,'sha256':sha(adapter.file_bytes(path)) if path.is_file() else None}
        require(len(strong_versions)<=2048,'HISTORY_LIMIT')
    evidence_files={}
    for directory in ['native-plans','operations','concierge-plans','concierge-receipts','concierge-diagnostics']:
        folder=safe(base/directory)
        if not folder.exists():continue
        for path in sorted(folder.rglob('*')):
            safe(path)
            if path.is_dir():continue
            data=private_file(path);s=path.stat()
            evidence_files[str(path.relative_to(base))]={'sha256':sha(data),'mode':stat.S_IMODE(s.st_mode),'uid':s.st_uid,'gid':s.st_gid,'dev':s.st_dev,'ino':s.st_ino,'nlink':s.st_nlink,'mtime_ns':s.st_mtime_ns}
            require(len(evidence_files)<=2048,'EVIDENCE_LIMIT')
    return {'plan_sha256':sha(private_file(plan_path)), 'journal_sha256':sha(private_file(journal_path)),
            'versions':snapshot(adapter,Path(original['prefix'])/'versions'),
            'strong_versions':strong_versions,'evidence_files':evidence_files,
            'node_custody':file_custody(original['node']['path']),'backup_custody':file_custody(original['backup']),
            'backup_sha256':sha(adapter.file_bytes(Path(original['backup'])))}

def prior_success(adapter, base, ident, expected_ref=PREVIOUS_REF):
    require(re.fullmatch('[a-f0-9]{32}',ident) is not None,'PRIOR_SUCCESS_ID_REQUIRED')
    raw=private_file(base/'concierge-plans'/(ident+'.json'));plan=json.loads(raw)
    unsigned=dict(plan);claim=unsigned.pop('approval_digest',None)
    require(sha(canonical(unsigned))==claim and plan.get('plan_id')==ident and plan.get('schema')=='xiio.concierge-cli-update-approval/v1','PRIOR_APPROVAL_CHANGED')
    receipt=json.loads(private_file(base/'concierge-receipts'/(ident+'.json')))
    private_file(base/'operations'/(ident+'-cli-update.jsonl'))
    journal=adapter.inspect_operation(ident+'-cli-update',root=base)
    require(plan.get('operation_id')==ident+'-cli-update' and journal['component']=='native-cli-concierge' and journal['operation']=='cli_update' and journal['correlation_id']==ident and journal['final_state']=='passed','PRIOR_UPDATE_NOT_PASSED')
    require(plan.get('source_sha')==expected_ref and receipt.get('source_sha')==expected_ref and receipt.get('state')=='CLI_UPDATE_AND_DETERMINISTIC_READ_VERIFIED','PRIOR_UPDATE_RECEIPT_UNQUALIFIED')
    require(all(receipt.get(k) is True for k in ['old_generations_and_receipts_preserved','original_unknown_evidence_unchanged','same_node_and_launcher','version_integrity_verified']) and receipt.get('read',{}).get('content_and_sha256_verified') is True,'PRIOR_UPDATE_READBACK_UNQUALIFIED')
    return plan,receipt

def packaged_payload(adapter, bundle, source):
    raw=adapter.file_bytes(safe(source/'packaged-source.json'))
    require(sha(raw)==MANIFEST_SHA,'DELIVERED_MANIFEST_NOT_PINNED')
    manifest=json.loads(raw)
    require(manifest.get('schema')=='xiio.cli.packaged-source/v1' and manifest.get('source_sha')==REF and manifest['files']['src/xiio.mjs']['sha256']==CONSUMER_SHA,'DELIVERED_SOURCE_NOT_PINNED')
    for rel,entry in manifest['files'].items():
        data=adapter.file_bytes(safe(source/rel))
        require(len(data)==entry['size'] and sha(data)==entry['sha256'],'DELIVERED_PAYLOAD_CHANGED')
    installer_sha=sha(adapter.file_bytes(safe(bundle/'cli-source/install.mjs')))
    require(installer_sha==INSTALLER_SHA,'INSTALLED_OFFLINE_INSTALLER_NOT_PINNED')
    return {'manifest':manifest,'manifest_sha256':sha(raw),'installer_sha256':installer_sha}

def preflight(adapter, base, original_id, prior_id, bundle, source):
    private_file(base/'native-plans'/(original_id+'.json'))
    p=adapter.load_plan(base,original_id)
    require(p.get('kind')=='launcher_repair','ORIGINAL_PLAN_KIND_UNQUALIFIED')
    home=Path.home();prefix=safe(home/'.local/share/xi-io/cli-v1');bin_dir=safe(home/'.local/bin');launcher=bin_dir/'xi-io-cli'
    require(p.get('prefix')==str(prefix) and p.get('bin_dir')==str(bin_dir) and p.get('launcher')==str(launcher),'ORIGINAL_TARGET_MISMATCH')
    private_file(base/'operations'/(original_id+'-apply_repair.jsonl'))
    old=adapter.inspect_operation(original_id+'-apply_repair',root=base)
    require(old['component']=='native-cli-installer' and old['operation']=='apply_repair' and old['correlation_id']==original_id and old['final_state']=='unknown','ORIGINAL_UNKNOWN_EVIDENCE_UNQUALIFIED')
    require(sha(adapter.file_bytes(Path(p['backup'])))==p['original_launcher_sha256'],'ORIGINAL_LAUNCHER_BACKUP_CHANGED')
    adapter.repair_pending(launcher)
    node=adapter.repair_node(p['node']['path'])
    require(node==p['node'],'APPROVED_NODE_CHANGED')
    current_launcher=adapter.repair_launcher(launcher)
    require(adapter.file_bytes(launcher)==adapter.repair_expected_launcher(str(prefix),node['path']) and current_launcher['sha256']==p['expected_launcher_sha256'],'REPAIRED_LAUNCHER_NOT_VERIFIED')
    prior,receipt=prior_success(adapter,base,prior_id)
    require(prior.get('original_plan_id')==original_id and prior.get('prefix')==str(prefix) and prior.get('bin_dir')==str(bin_dir) and prior['before']['original']==p and prior['before']['node']==node,'PRIOR_UPDATE_TARGET_MISMATCH')
    require(prior['before']['launcher']==current_launcher and prior['before']['bin']==adapter.repair_bin(bin_dir),'APPROVED_LAUNCHER_IDENTITY_CHANGED')
    history=adapter.repair_history(prefix,node)
    require(history['current']==receipt.get('generation') and history['previous']==receipt.get('previous')==prior['before']['history']['current'],'SUCCESSFUL_UPDATE_POINTERS_CHANGED')
    require(history['receipts']['current']['source_sha']==PREVIOUS_REF and history['receipts']['current']['files']=={k:v['sha256'] for k,v in prior['before']['payload']['manifest']['files'].items()},'CURRENT8DFF_RECEIPT_NOT_QUALIFIED')
    # DEV9 replaced the package, not the approved current8dff generation.
    prior_payload=prior['before']['payload']
    require(prior_payload['manifest_sha256']=='8820c3af60e558cab219b1999924a6192a2bbc5ec9f555bccccbbdfcd89b74cb' and prior_payload['installer_sha256']=='6311b606049f07d35bc31e78f73218a95a114d3723c9f8b97bcb8f3262d8d5a6' and prior_payload['manifest']['source_sha']==PREVIOUS_REF and prior_payload['manifest']['files']['src/xiio.mjs']['sha256']=='8e4b9c8b066378e0e8b54cdda5fdf0173c1307e8b4db28f8acc0bda7a816b959','CURRENT8DFF_APPROVED_PAYLOAD_UNQUALIFIED')
    require(history['receipts']['previous']==prior['before']['history']['receipts']['current'],'PRIOR_ROLLBACK_RECEIPT_CHANGED')
    prior_protected=prior['before']['protected']
    current_protected=protected(adapter,p,base)
    require(all(current_protected[k]==prior_protected[k] for k in ['plan_sha256','journal_sha256','backup_sha256']),'ORIGINAL_UNKNOWN_EVIDENCE_CHANGED')
    expected_roots={k.split('/')[0] for k in prior_protected['versions']}|{receipt['generation']}
    require({k.split('/')[0] for k in current_protected['versions']}==expected_roots and all(current_protected['versions'].get(k)==v for k,v in prior_protected['versions'].items()),'PRIOR_HISTORICAL_GENERATIONS_CHANGED')
    ancestor_id=qualified_ancestry(adapter,base,prior_id,prior,p)
    inherited=prior_protected.get('prior_evidence',{})
    ancestor_paths={str(path.relative_to(base)) for path in [base/'concierge-plans'/(ancestor_id+'.json'),base/'concierge-receipts'/(ancestor_id+'.json'),base/'operations'/(ancestor_id+'-cli-update.jsonl')]}
    require(set(inherited)==ancestor_paths and all(sha(private_file(base/rel))==digest for rel,digest in inherited.items()),'ANCESTOR_SUCCESS_EVIDENCE_CHANGED')
    current_protected['prior_evidence']={**inherited,**{str(path.relative_to(base)):sha(private_file(path)) for path in [base/'concierge-plans'/(prior_id+'.json'),base/'concierge-receipts'/(prior_id+'.json'),base/'operations'/(prior_id+'-cli-update.jsonl')]}}
    payload=packaged_payload(adapter,bundle,source)
    return {'original':p,'node':node,'history':history,'launcher':current_launcher,'bin':adapter.repair_bin(bin_dir),'payload':payload,'protected':current_protected,'prior_success_id':prior_id,'ancestor_success_id':ancestor_id}

def qualified_ancestry(adapter, base, prior_id, prior, original):
    ancestor_id=prior.get('prior_success_id')
    require(isinstance(ancestor_id,str) and ancestor_id!=prior_id and prior['before'].get('prior_success_id')==ancestor_id,'APPROVED_ANCESTOR_REQUIRED')
    ancestor,receipt=prior_success(adapter,base,ancestor_id,ANCESTOR_REF)
    require(ancestor.get('original_plan_id')==original['plan_id'] and ancestor.get('prefix')==original['prefix'] and ancestor.get('bin_dir')==original['bin_dir'] and ancestor['before']['original']==original and ancestor['before']['node']==prior['before']['node'],'ANCESTOR_TARGET_UNQUALIFIED')
    require(receipt['generation']==prior['before']['history']['current'] and receipt['previous']==prior['before']['history']['previous'] and prior['before']['history']['receipts']['current']['source_sha']==ANCESTOR_REF,'ANCESTOR_GENERATION_UNQUALIFIED')
    require(prior['before']['history']['receipts']['current']['files']=={k:v['sha256'] for k,v in ancestor['before']['payload']['manifest']['files'].items()},'ANCESTOR_PAYLOAD_UNQUALIFIED')
    return ancestor_id

def stop_prior_attempts(adapter, base, prefix, prior_id):
    prior,_=prior_success(adapter,base,prior_id)
    original=prior['before']['original']
    ancestor_id=qualified_ancestry(adapter,base,prior_id,prior,original)
    allowed={prior_id,ancestor_id}
    directory=safe(base/'concierge-plans')
    require(directory.is_dir(),'PRIOR_CONCIERGE_SUCCESS_REQUIRED')
    rows=list(directory.glob('*.json'));require(len(rows)<=128,'CONCIERGE_EVIDENCE_LIMIT')
    for file in rows:
        p=json.loads(private_file(file));unsigned=dict(p);claim=unsigned.pop('approval_digest',None)
        require(sha(canonical(unsigned))==claim,'CONCIERGE_PLAN_CHANGED')
        if p.get('prefix')!=str(prefix):continue
        if file.stem not in allowed:raise Stop('OTHER_CONCIERGE_ATTEMPT_DO_NOT_RETRY')


def save_private(path, value):
    safe(path.parent);path.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
    require(path.parent.stat().st_uid==os.getuid() and not path.parent.stat().st_mode&0o077,'EVIDENCE_DIRECTORY_NOT_PRIVATE')
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'wb') as stream:stream.write(canonical(value));stream.flush();os.fsync(stream.fileno())

def run_json(adapter, argv, timeout=90):
    # Existing adapter clean environment and isolated HOME: no ambient credentials,
    # preloads or regular application settings are passed to the installed CLI.
    try:raw=adapter.run(argv,timeout)
    except Exception:raise Stop('INSTALLED_COMMAND_FAILED_OR_TIMED_OUT') from None
    try:result=json.loads(raw)
    except Exception:raise Stop('INSTALLED_COMMAND_RESULT_INVALID') from None
    require(isinstance(result,dict),'INSTALLED_COMMAND_RESULT_INVALID');return result

def installed_read(adapter, launcher):
    # The file is created exclusively in a new private test workspace, not the
    # user's active project. Only /read and /exit are ever written to CLI stdin.
    with tempfile.TemporaryDirectory(prefix='xiio-concierge-read-') as tmp:
        root=Path(tmp);workspace=root/'workspace';workspace.mkdir();proof=workspace/'proof.txt';proof.write_text(PROOF)
        env=adapter.env(root/'isolated-home');Path(env['HOME']).mkdir()
        child=subprocess.Popen([str(launcher),'chat',str(workspace)],cwd=workspace,env=env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        def prompt():
            output=b'';deadline=time.monotonic()+20
            while time.monotonic()<deadline:
                readable,_,_=select.select([child.stdout,child.stderr],[],[],.2)
                for stream in readable:
                    data=os.read(stream.fileno(),65536)
                    require(bool(data),'INSTALLED_READ_EARLY_EXIT')
                    require(stream is child.stdout,'INSTALLED_READ_STDERR')
                    output+=data;require(len(output)<=256*1024,'INSTALLED_READ_OUTPUT_LIMIT')
                    if output.endswith(b'xi> '):return output.decode('utf-8')
            raise Stop('INSTALLED_READ_TIMED_OUT')
        try:
            prompt();child.stdin.write(b'/read proof.txt\n');child.stdin.flush();output=prompt()
            child.stdin.write(b'/exit\n');child.stdin.flush();stdout,stderr=child.communicate(timeout=10)
            require(child.returncode==0 and not stderr,'INSTALLED_READ_EXIT_UNVERIFIED')
        finally:
            if child.poll() is None:child.kill();child.wait()
        marker='Actual execution receipt (CLI-observed, not model claims):\n'
        require(output.count(marker)==1,'INSTALLED_READ_RECEIPT_MISSING')
        try:receipt,_=json.JSONDecoder().raw_decode(output.split(marker,1)[1])
        except Exception:raise Stop('INSTALLED_READ_RECEIPT_INVALID') from None
        require(receipt.get('source')=='direct_read' and receipt.get('state')=='TOOL_RESULTS_RECORDED' and len(receipt.get('tool_results',[]))==1,'INSTALLED_READ_NOT_VERIFIED')
        fact=receipt['tool_results'][0];result=fact.get('result',{})
        require(fact.get('name')=='read_workspace_file' and fact.get('state')=='SUCCEEDED' and result.get('path')=='proof.txt' and result.get('content')==PROOF and result.get('sha256')==sha(PROOF.encode()) and result.get('byte_length')==len(PROOF.encode()) and result.get('full_content_returned') is True,'INSTALLED_READ_CONTENT_OR_DIGEST_MISMATCH')
        require(proof.read_bytes()==PROOF.encode(),'READ_FIXTURE_CHANGED')
        return {'source':'actual_installed_launcher','content_and_sha256_verified':True,'input_unchanged':True,'sha256':sha(PROOF.encode()),'byte_length':len(PROOF.encode()),'model_inference':'NOT_REQUESTED_OR_QUALIFIED'}

def verify_preservation(adapter, base, before, generation):
    after=protected(adapter,before['original'],base);old=before['protected']
    require(all(sha(private_file(base/rel))==digest for rel,digest in old['prior_evidence'].items()),'PRIOR_SUCCESS_EVIDENCE_CHANGED')
    old_roots={key.split('/')[0] for key in old['versions']}
    existing={key:value for key,value in after['versions'].items() if key.split('/')[0] in old_roots}
    require({key.split('/')[0] for key in after['versions']}==old_roots|{generation},'UNEXPECTED_GENERATION_ADDITION')
    require(existing==old['versions'] and after['plan_sha256']==old['plan_sha256'] and after['journal_sha256']==old['journal_sha256'] and after['backup_sha256']==old['backup_sha256'],'ORIGINAL_EVIDENCE_OR_GENERATION_CHANGED')
    require(all(after['strong_versions'].get(key)==value for key,value in old['strong_versions'].items()),'HISTORICAL_GENERATION_CUSTODY_CHANGED')
    require(all(after['evidence_files'].get(key)==value for key,value in old['evidence_files'].items()),'HISTORICAL_EVIDENCE_CUSTODY_CHANGED')
    require(after['node_custody']==old['node_custody'] and after['backup_custody']==old['backup_custody'],'PROTECTED_NODE_OR_BACKUP_CUSTODY_CHANGED')

def postflight(adapter, base, before, update):
    p=before['original'];prefix=Path(p['prefix']);launcher=Path(p['launcher']);history=adapter.repair_history(prefix,before['node'])
    generation=update.get('generation')
    require(update.get('state')=='PASS' and update.get('source_sha')==REF and update.get('prefix')==str(prefix) and update.get('launcher')==str(launcher) and update.get('adopted_existing_launcher') is False,'OFFLINE_UPDATE_RECEIPT_UNQUALIFIED')
    require(history['current']==generation and generation not in [before['history']['current'],before['history']['previous']] and history['previous']==before['history']['current'],'UPDATE_POINTER_READBACK_MISMATCH')
    require(history['receipts']['current']['source_sha']==REF and history['receipts']['current']['files']=={key:value['sha256'] for key,value in before['payload']['manifest']['files'].items()},'NEW_GENERATION_PAYLOAD_MISMATCH')
    fresh=safe(prefix/'versions'/generation);directories={fresh}
    for relative in [*before['payload']['manifest']['files'],'install-receipt.json']:
        file=safe(fresh/relative);info=file.stat()
        require(stat.S_ISREG(info.st_mode) and info.st_nlink==1 and info.st_uid==os.getuid() and stat.S_IMODE(info.st_mode)==0o600,'NEW_GENERATION_FILE_CUSTODY_UNVERIFIED')
        parent=file.parent
        while parent!=fresh:directories.add(parent);parent=parent.parent
    for directory in directories:
        info=directory.stat()
        require(stat.S_ISDIR(info.st_mode) and info.st_uid==os.getuid() and stat.S_IMODE(info.st_mode)==0o700,'NEW_GENERATION_DIRECTORY_CUSTODY_UNVERIFIED')
    require(adapter.repair_node(before['node']['path'])==before['node'] and adapter.repair_launcher(launcher)==before['launcher'] and adapter.repair_bin(Path(p['bin_dir']))==before['bin'],'NODE_OR_LAUNCHER_CHANGED')
    verify_preservation(adapter,base,before,generation)
    version=run_json(adapter,[str(launcher),'version'],30)
    require(version.get('state')=='PASS' and version.get('integrity_verified') is True and version.get('source_sha')==REF and version.get('generation')==generation and version.get('running_file_sha256')==CONSUMER_SHA,'INSTALLED_VERSION_NOT_VERIFIED')
    doctor=run_json(adapter,[str(launcher),'doctor'],60)
    require(doctor.get('schema')=='xiio.cli.doctor/v1' and doctor.get('effect_authority')==0,'INSTALLED_DOCTOR_UNQUALIFIED')
    read=installed_read(adapter,launcher)
    return {'state':'CLI_UPDATE_AND_DETERMINISTIC_READ_VERIFIED','source_sha':REF,'generation':generation,'previous':history['previous'],
            'old_generations_and_receipts_preserved':True,'original_unknown_evidence_unchanged':True,'same_node_and_launcher':True,
            'version_integrity_verified':True,'core_catalog_custody_verified':True,'core_catalog_mode':'0600','doctor':{'state':doctor.get('state'),'first_red':doctor.get('first_red'),'services_health_accepted':False},
            'read':read,'remote_connection':'NOT_REQUESTED_OR_VERIFIED','model_inference':'NOT_REQUESTED_OR_QUALIFIED'}

def concierge(original_id, *, prior_id, bundle=BUNDLE, source=PAYLOAD, approve=None):
    require(re.fullmatch('[a-f0-9]{32}',original_id) is not None,'ORIGINAL_PLAN_ID_REQUIRED')
    adapter=load_adapter(bundle)
    base=safe(Path(os.environ.get('XDG_STATE_HOME',str(Path.home()/'.local/state')))/'xi-io/installer')
    require(base.is_dir() and base.stat().st_uid==os.getuid() and not base.stat().st_mode&0o077,'EXISTING_PRIVATE_INSTALLER_STATE_REQUIRED')
    lock=base/'native-adapter.lock'
    if lock.exists():private_file(lock)
    fd=os.open(lock,os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600);journal=None
    try:
        try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:raise Stop('INSTALLER_BUSY_NO_RETRY') from None
        stop_prior_attempts(adapter,base,Path.home()/'.local/share/xi-io/cli-v1',prior_id)
        before=preflight(adapter,base,original_id,prior_id,bundle,source);p=before['original'];ident=uuid.uuid4().hex
        plan={'schema':'xiio.concierge-cli-update-approval/v1','plan_id':ident,'prefix':p['prefix'],'bin_dir':p['bin_dir'],'source_sha':REF,
              'prior_success_id':prior_id,'original_plan_id':original_id,'original_unknown_approval_reused':False,'original_unknown_state_resolved':False,
              'before':before,'operation_id':ident+'-cli-update','created_at':datetime.datetime.now(datetime.timezone.utc).isoformat()}
        plan['approval_digest']=sha(canonical(plan));token='update'
        print('Fresh CLI UPDATE only; this does NOT connect this computer to ChatGPT: '+REF)
        print('Current '+before['history']['current']+' → new generation; previous → old current.')
        print('All old generations, receipts, original UNKNOWN evidence, credentials and project data remain untouched.')
        print('Existing Node: '+before['node']['path']+' '+before['node']['version']+' SHA-256 '+before['node']['sha256'])
        print('Reviewed update SHA-256: '+plan['approval_digest'])
        print('Same launcher/bin. No runtime download, service, connection or model inference. Includes private disposable read proof.')
        if approve is None:
            require(sys.stdin.isatty() and sys.stdout.isatty(),'INTERACTIVE_APPROVAL_REQUIRED')
            accepted=input('Type '+token+' to approve this exact update (Enter cancels): ').strip().lower()==token
        else:accepted=approve(plan,token)
        require(accepted,'CANCELLED_NO_CLI_UPDATE')
        require(preflight(adapter,base,original_id,prior_id,bundle,source)==before,'TARGET_CHANGED_SINCE_APPROVAL')
        stop_prior_attempts(adapter,base,Path(p['prefix']),prior_id)
        save_private(base/'concierge-plans'/(ident+'.json'),plan)
        journal=adapter.OperationJournal('native-cli-concierge','cli_update',operation_id=plan['operation_id'],correlation_id=ident,root=base)
        journal.start('Explicit side-by-side CLI update with qualified existing offline custody producer',details={'approval_digest':plan['approval_digest'],'source_sha':REF,'original_unknown_evidence_preserved':True})
        update=run_json(adapter,[before['node']['path'],str(bundle/'cli-source/install.mjs'),'--packaged-source',str(source),'--ref',REF,'--prefix',p['prefix'],'--bin-dir',p['bin_dir']],None)
        result=postflight(adapter,base,before,update)
        # One final preservation check after doctor/read, before accepting the turn.
        require(adapter.repair_launcher(Path(p['launcher']))==before['launcher'] and adapter.repair_node(before['node']['path'])==before['node'],'POSTCHECK_IDENTITY_CHANGED')
        verify_preservation(adapter,base,before,result['generation'])
        require(adapter.repair_history(Path(p['prefix']),before['node'])['current']==result['generation'],'POSTCHECK_GENERATION_CHANGED')
        result['plan_id']=ident
        save_private(base/'concierge-receipts'/(ident+'.json'),result)
        journal.finish('passed','Installed version and deterministic local read verified; service and remote acceptance not claimed',expected_action='cli_update',details={'approval_digest':plan['approval_digest'],'source_sha':REF,'generation':result['generation'],'read_sha256':result['read']['sha256']})
        print(json.dumps({'state':result['state'],'source_sha':REF,'doctor_state':result['doctor']['state'],'original_unknown_unchanged':True,'model_inference':'NOT_QUALIFIED','remote_connection':'NOT_VERIFIED','private_receipt':str(base/'concierge-receipts'/(ident+'.json'))}))
        return result
    except Exception as error:
        if journal is not None:
            try:journal.finish('unknown','Update execution or readback uncertain. Preserve all evidence; do not retry or automatically roll back.',expected_action='cli_update',details={'first_red':str(error) if isinstance(error,Stop) else 'INTERNAL_CHECK_FAILED'})
            except Exception:pass
        raise
    finally:os.close(fd)

def package_verified():
    env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8'}
    state=subprocess.run(['/usr/bin/dpkg-query','-W','-f=${Version} ${Status}','xi-io-hex-dev'],capture_output=True,text=True,env=env,timeout=30)
    require(state.returncode==0 and state.stdout=='0.1.0-dev.9 install ok installed' and not state.stderr,'HEX_DEV9_PACKAGE_NOT_CONFIGURED')
    check=subprocess.run(['/usr/bin/dpkg','--verify','xi-io-hex-dev'],capture_output=True,text=True,env=env,timeout=60)
    require(check.returncode==0 and not check.stdout and not check.stderr,'HEX_DEV9_PACKAGE_READBACK_FAILED')

def launch_accepted(result, *, bundle=BUNDLE):
    # This is a user-facing no-argument session, never injected tool actions.
    cwd=Path.cwd().resolve();home=Path.home().resolve()
    if cwd==home or cwd==Path(cwd.anchor):
        print('Update verified. Choose a bounded project folder before opening xi-io-cli; nothing was undone.')
        return False
    adapter=load_adapter(bundle)
    base=safe(Path(os.environ.get('XDG_STATE_HOME',str(Path.home()/'.local/state')))/'xi-io/installer')
    plan,receipt=prior_success(adapter,base,result.get('plan_id',''),REF)
    require(receipt==result,'ACCEPTED_RECEIPT_CHANGED')
    before=plan['before'];p=before['original'];launcher=Path(p['launcher'])
    require(plan['original_plan_id']==p['plan_id'] and plan['prefix']==str(home/'.local/share/xi-io/cli-v1') and plan['bin_dir']==str(home/'.local/bin'),'LAUNCH_TARGET_UNQUALIFIED')
    require(adapter.repair_node(before['node']['path'])==before['node'] and adapter.repair_launcher(launcher)==before['launcher'] and adapter.repair_bin(Path(p['bin_dir']))==before['bin'],'LAUNCH_IDENTITY_CHANGED')
    history=adapter.repair_history(Path(p['prefix']),before['node'])
    require(history['current']==receipt['generation'] and history['previous']==receipt['previous'] and history['receipts']['current']['source_sha']==REF and history['receipts']['current']['files']=={k:v['sha256'] for k,v in before['payload']['manifest']['files'].items()},'ACCEPTED_GENERATION_CHANGED')
    require(sha(adapter.file_bytes(Path(p['prefix'])/'versions'/receipt['generation']/'src/xiio.mjs'))==CONSUMER_SHA,'ACCEPTED_SOURCE_CHANGED')
    env=dict(os.environ)
    for key in ('NODE_OPTIONS','NODE_PATH','PYTHONPATH','PYTHONHOME','PYTHONSTARTUP','PYTHONINSPECT','PYTHONUSERBASE','LD_PRELOAD','LD_LIBRARY_PATH'):
        env.pop(key,None)
    print('Opening the local XI-IO CLI in '+str(cwd)+'. Remote connection remains NOT VERIFIED.',flush=True)
    session=subprocess.run([str(launcher)],cwd=str(cwd),env=env)
    print('CLI session exited with status '+str(session.returncode)+'. The accepted update receipt is unchanged.')
    return True

def main():
    parser=argparse.ArgumentParser(description='Existing HEX DEV9 side-by-side CLI update; no remote access or identity creation.')
    parser.add_argument('--original-plan',required=True)
    parser.add_argument('--prior-success',required=True)
    args=parser.parse_args()
    try:
        require(os.geteuid()!=0,'RUN_AS_THE_EXISTING_CLI_OWNER_NOT_ROOT')
        package_verified()
        result=concierge(args.original_plan,prior_id=args.prior_success)
    except Exception as error:
        code=str(error) if isinstance(error,Stop) else 'PREFLIGHT_OR_READBACK_UNVERIFIED'
        print(json.dumps({'state':'STOPPED','first_red':code,'retry':'DO_NOT_RETRY_WITHOUT_REVIEW','automatic_rollback':False}),file=sys.stderr);return 2
    print('CLI update and local read verified. No identity was created; remote connection remains NOT VERIFIED.')
    print('Rollback is the existing CLI rollback command; all prior generations remain. Do not rerun this updater.')
    try:launch_accepted(result)
    except Exception as error:
        code=str(error) if isinstance(error,Stop) else 'LAUNCH_READBACK_UNVERIFIED'
        print(json.dumps({'cli_update_state':result['state'],'launch':'NOT_OPENED','first_red':code,'remote_connection':'NOT_VERIFIED','automatic_rollback':False,'retry':'DO_NOT_RERUN_UPDATER'}))
    return 0
if __name__=='__main__':sys.exit(main())
