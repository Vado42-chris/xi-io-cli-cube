import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, copyFileSync, symlinkSync, readFileSync, existsSync, rmSync, chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

const script=new URL('../scripts/build-flatpak.sh',import.meta.url);
test('Flatpak builder unavailability is a typed failure before any staging',()=>{
  const dir=mkdtempSync(join(tmpdir(),'xiio-flatpak-unavailable-'));
  try{
    const scripts=join(dir,'scripts'),bin=join(dir,'bin');
    mkdirSync(scripts);mkdirSync(bin);
    const target=join(scripts,'build-flatpak.sh');
    copyFileSync(script,target);chmodSync(target,0o755);
    symlinkSync('/usr/bin/dirname',join(bin,'dirname'));
    const result=spawnSync('/bin/bash',[target],{
      cwd:dir,
      env:{HOME:dir,PATH:bin,LANG:'C.UTF-8'},
      encoding:'utf8',timeout:10000,
    });
    assert.equal(result.error,undefined);
    assert.equal(result.status,69,'missing Flatpak builder must fail, not exit 0');
    assert.match(result.stderr,/FLATPAK_BUILD_BLOCKED/);
    assert.equal(existsSync(join(dir,'dist')),false,'no package or OSTree staging may occur');
    assert.equal(existsSync(join(dir,'build')),false,'no package build may occur');
    assert.equal(existsSync(join(dir,'packaging')),false,'no canonical artifact may be touched');
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('Flatpak CLI absence refuses even if a builder command is present',()=>{
  const dir=mkdtempSync(join(tmpdir(),'xiio-flatpak-cli-absent-'));
  try{
    const scripts=join(dir,'scripts'),bin=join(dir,'bin');
    mkdirSync(scripts);mkdirSync(bin);
    const target=join(scripts,'build-flatpak.sh');
    copyFileSync(script,target);
    symlinkSync('/usr/bin/dirname',join(bin,'dirname'));
    symlinkSync('/usr/bin/true',join(bin,'flatpak-builder'));
    const result=spawnSync('/bin/bash',[target],{cwd:dir,env:{HOME:dir,PATH:bin,LANG:'C.UTF-8'},encoding:'utf8',timeout:10000});
    assert.equal(result.status,69);
    assert.match(result.stderr,/FLATPAK_BUILD_BLOCKED/);
    assert.equal(existsSync(join(dir,'dist')),false);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('release script must require nonempty Flatpak output',()=>{
  const s=readFileSync(script,'utf8');
  assert.match(s,/if \[ ! -s "\$BUNDLE_OUT" \]/);
  assert.match(s,/exit 70/);
  assert.doesNotMatch(s,/exit 0/);
  const result=spawnSync('/bin/bash',['-n',new URL(script).pathname],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});

test('GNOME46 candidate filesystem grants avoid unsupported XDG state location',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../packaging/flatpak/com.xiio.hex.json',import.meta.url),'utf8'));
  assert.equal(manifest.runtime,'org.gnome.Platform');
  assert.equal(manifest['runtime-version'],'46');
  assert.ok(manifest['finish-args'].every(p=>!p.includes('xdg-state/')),'Flatpak on Ubuntu22.04 does not support xdg-state grant');
  assert.ok(manifest['finish-args'].includes('--filesystem=xdg-data/xi-io:create'));
});
test('Flatpak launcher chooses app-private state without host-wide permission',()=>{
  const runner=readFileSync(new URL('../packaging/flatpak/xi-io-hex-runner.sh',import.meta.url),'utf8');
  assert.match(runner,/XDG_STATE_HOME.*\\.var\\/app\\/com\\.xiio\\.hex\\/state/);
  assert.doesNotMatch(runner,/XDG_STATE_HOME.*\\.local\\/state/);
  const check=spawnSync('/bin/sh',['-n',new URL('../packaging/flatpak/xi-io-hex-runner.sh',import.meta.url).pathname],{encoding:'utf8'});
  assert.equal(check.status,0,check.stderr);
});
