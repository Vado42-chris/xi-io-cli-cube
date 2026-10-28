import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync, readFileSync, statSync, writeFileSync, chmodSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, posix} from 'node:path';

test('official OpenAI v0.0.18 full Linux tunnel client is executable with supported CLI commands', {timeout:240000}, (t) => {
  if (process.env.GITHUB_ACTIONS !== 'true') return t.skip('exact vendor archive requires independent GitHub-hosted runner');
  const dir=mkdtempSync(join(tmpdir(),'xiio-tunnel-vendor-'));
  try {
    const archive=join(dir,'client.zip');
    const url='https://github.com/openai/tunnel-client/releases/download/v0.0.18/tunnel-client-v0.0.18-linux-amd64.zip';
    execFileSync('curl',['--fail','--location','--silent','--show-error','--retry','2','--connect-timeout','12','--max-time','210','--proto','=https','--tlsv1.2','--output',archive,url],{timeout:220000});
    assert.equal(statSync(archive).size,29420141,'exact official full-client archive byte length');
    assert.equal(createHash('sha256').update(readFileSync(archive)).digest('hex'),
      '3c82307316acd93c88a384b62af1d81d3f4cb0efa975f9c0bfaef922866a04c4',
      'exact official full-client archive digest');
    const rows=execFileSync('unzip',['-Z1',archive],{encoding:'utf8'}).trim().split('\n');
    assert.ok(rows.length>=1&&rows.length<=30,'bounded archive members');
    const bins=rows.filter(x=>posix.basename(x)==='tunnel-client');
    assert.equal(bins.length,1,'one expected tunnel-client executable');
    assert.ok(!bins[0].startsWith('/')&&!bins[0].split('/').includes('..'),'safe member');
    const bytes=execFileSync('unzip',['-p',archive,bins[0]],{maxBuffer:70*1024*1024,timeout:15000});
    assert.ok(bytes.length>1024&&bytes.length<=65*1024*1024,'bounded native ELF');
    assert.equal(bytes.subarray(0,4).toString('hex'),'7f454c46','real ELF');
    const bin=join(dir,'tunnel-client');
    writeFileSync(bin,bytes,{mode:0o700});chmodSync(bin,0o700);
    const version=execFileSync(bin,['--version'],{encoding:'utf8',timeout:8000});
    assert.match(version,/0\.0\.18/,'vendor version');
    const quickstart=execFileSync(bin,['help','quickstart'],{encoding:'utf8',timeout:8000});
    assert.ok(quickstart.trim().length>0,'quickstart is visible');
    const doctorHelp=execFileSync(bin,['doctor','--help'],{encoding:'utf8',timeout:8000});
    assert.match(doctorHelp,/--profile-file/,'doctor accepts the existing explicit profile');
    assert.match(doctorHelp,/--explain/,'doctor supports the diagnostic path');
    const runHelp=execFileSync(bin,['run','--help'],{encoding:'utf8',timeout:8000});
    assert.match(runHelp,/--profile-file/,'runtime accepts the same explicit profile');
    console.log('OFFICIAL_FULL_CLIENT_V0018_DIGEST_MEMBER_VERSION_CLI_PASS',
       JSON.stringify({sha256:createHash('sha256').update(bytes).digest('hex'),
         bytes:bytes.length,member:bins[0]}));
  } finally {rmSync(dir,{recursive:true,force:true});}
});
