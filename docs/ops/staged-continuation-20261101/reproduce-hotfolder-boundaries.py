"""Read-only verification probes against the pinned consumer; all data disposable.
PASS here means a defect was reproduced, not that a release is qualified.
"""
import hashlib, importlib.util, json, pathlib, tempfile

source = pathlib.Path(__file__).parent / 'sources/hotfolder-update-consumer.py'
spec = importlib.util.spec_from_file_location('hotfolder', source)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
findings = []
with tempfile.TemporaryDirectory(prefix='xiio-preflight-') as td:
    base = pathlib.Path(td)
    root = base / 'incoming'
    root.mkdir()
    outside = base / 'outside'
    outside.mkdir()
    target = outside / 'payload.mjs'
    target.write_text('export const fixture = true;\n')
    (root / 'install.mjs').write_text('// untrusted disposable fixture only\n')
    (root / 'linked').symlink_to(outside, target_is_directory=True)
    meta = {'sha256':hashlib.sha256(target.read_bytes()).hexdigest(), 'size':target.stat().st_size}
    for case, rel in [('absolute_path',str(target)), ('parent_traversal','../outside/payload.mjs'), ('ancestor_symlink','linked/payload.mjs')]:
        manifest = {'schema':'xiio.cli.packaged-source/v1','source_sha':'1'*40,'files':{rel:meta}}
        (root/'packaged-source.json').write_text(json.dumps(manifest))
        try:
            result = module.verify_packaged(root, '1'*40)
            findings.append({'case':case,'defect_reproduced':True,'observed':'ACCEPTED_OUTSIDE_ROOT','source_sha':result['source_sha']})
        except Exception as exc:
            findings.append({'case':case,'defect_reproduced':False,'observed':str(exc)})
    # No execution: verify whether changed installer bytes have an independent expected hash.
    (root/'payload.mjs').write_bytes(target.read_bytes())
    (root/'packaged-source.json').write_text(json.dumps({'schema':'xiio.cli.packaged-source/v1','source_sha':'1'*40,'files':{'payload.mjs':meta}}))
    before = module.verify_packaged(root, '1'*40)
    (root/'install.mjs').write_text('// changed installer still not executed\n')
    after = module.verify_packaged(root, '1'*40)
    findings.append({'case':'installer_hash_is_observed_not_authenticated','defect_reproduced':before['installer_sha256'] != after['installer_sha256'],'observed':'BOTH_ACCEPTED_WITH_SAME_EXPECTED_SOURCE'})
print(json.dumps({'qualification':'DEFECT_REPRODUCTION_ONLY','candidate':'e1862a55a89cb64cb851531e0a55c36e928dcab4','findings':findings},indent=2))
assert all(row['defect_reproduced'] for row in findings)
