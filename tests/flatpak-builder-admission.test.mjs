import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, copyFileSync, symlinkSync, readFileSync, existsSync, rmSync, chmodSync, writeFileSync} from 'node:fs';
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

test('supported GNOME50 candidate filesystem grants avoid unsupported XDG state location',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../packaging/flatpak/com.xiio.hex.json',import.meta.url),'utf8'));
  assert.equal(manifest.runtime,'org.gnome.Platform');
  assert.equal(manifest['runtime-version'],'50');
  assert.ok(manifest['finish-args'].every(p=>!p.includes('xdg-state/')));
  assert.ok(manifest['finish-args'].includes('--filesystem=xdg-data/xi-io:create'));
});
test('Flatpak launcher chooses app-private state without host-wide permission',()=>{
  const runner=readFileSync(new URL('../packaging/flatpak/xi-io-hex-runner.sh',import.meta.url),'utf8');
  assert.ok(runner.includes('$HOME/.var/app/com.xiio.hex/state'));
  assert.equal(runner.includes('$HOME/.local/state'),false);
  const check=spawnSync('/bin/sh',['-n',new URL('../packaging/flatpak/xi-io-hex-runner.sh',import.meta.url).pathname],{encoding:'utf8'});
  assert.equal(check.status,0,check.stderr);
});
test('Flatpak icon packaging preserves original logo and uses transient 512-square derivative',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../packaging/flatpak/com.xiio.hex.json',import.meta.url),'utf8'));
  assert.ok(manifest.modules[0]['build-commands'].some(x=>x.includes('.xiio-hex-icon-512.png /app/share/icons/hicolor/512x512/apps/com.xiio.hex.png')));
  assert.ok(manifest.modules[0].sources.some(x=>x.path==='.xiio-hex-icon-512.png'));
  const builder=readFileSync(script,'utf8');
  assert.ok(builder.includes('ICON_STAGE="$PACKAGING_DIR/.xiio-hex-icon-512.png"'));
  assert.ok(builder.includes("trap 'rm -f --"));
  assert.ok(builder.includes('convert "$PACKAGING_DIR/com.xiio.hex.png" -resize 512x512'));
  assert.ok(builder.includes('-extent 512x512 "$ICON_STAGE"'));
});

test('Flatpak builder and build-bundle select identical stable OSTree ref',()=>{
  const builder=readFileSync(script,'utf8');
  assert.ok(builder.includes('--default-branch=stable'));
  assert.ok(builder.includes('flatpak build-bundle "$REPO_DIR" "$BUNDLE_OUT" com.xiio.hex stable'));
});

test('product package refuses historical staged binary and requires fresh Rust build provenance',()=>{
  const builder=readFileSync(script,'utf8');
  const manifest=JSON.parse(readFileSync(new URL('../packaging/flatpak/com.xiio.hex.json',import.meta.url),'utf8'));
  assert.ok(builder.includes('cargo build --locked --release'));
  assert.ok(builder.includes('npm run native:stage'));
  assert.ok(builder.includes('CARGO_TARGET_DIR="$BUILD_DIR/fresh-cargo"'));
  assert.ok(builder.includes('FRESH_CARRIER="$PACKAGING_DIR/.xiio-hex-fresh-carrier"'));
  assert.ok(builder.includes('source_commit'));
  assert.ok(builder.includes('frontend_tree_sha256'));
  assert.ok(builder.includes('cargo_lock_sha256'));
  assert.ok(builder.includes('historical_dev9_elf_used'));
  assert.ok(!builder.includes('dpkg-deb -x'));
  assert.ok(!builder.includes('deliveries/hex-dev/0.1.0-dev.9/xi-io-hex-dev'));
  assert.equal(manifest.modules[0].sources.some(x=>x.path==='xi-io-hex-dev'),false);
  assert.ok(manifest.modules[0].sources.some(x=>x.path==='.xiio-hex-fresh-carrier'));
  assert.ok(manifest.modules[0]['build-commands'].some(x=>x.includes('.xiio-hex-fresh-carrier /app/bin/xi-io-hex-dev')));
  assert.ok(manifest.modules[0].sources.some(x=>x.path==='.xiio-hex-source-provenance.json'));
});

test('pre-1.4 Flatpak builder is rejected before AppStream or package staging',()=>{
  const dir=mkdtempSync(join(tmpdir(),'xiio-flatpak-obsolete-builder-'));
  try{
    const scripts=join(dir,'scripts'),bin=join(dir,'bin');
    mkdirSync(scripts);mkdirSync(bin);
    const target=join(scripts,'build-flatpak.sh');
    copyFileSync(script,target);
    symlinkSync('/usr/bin/dirname',join(bin,'dirname'));
    symlinkSync('/usr/bin/awk',join(bin,'awk'));
    symlinkSync('/usr/bin/grep',join(bin,'grep'));
    symlinkSync('/usr/bin/head',join(bin,'head'));
    symlinkSync('/usr/bin/true',join(bin,'flatpak'));
    const builder=join(bin,'flatpak-builder');
    writeFileSync(builder,'#!/bin/sh\nprintf "flatpak-builder-1.2.2\n"\n');
    chmodSync(builder,0o755);
    const result=spawnSync('/bin/bash',[target],{cwd:dir,env:{PATH:bin,HOME:dir},encoding:'utf8',timeout:10000});
    assert.equal(result.status,69,result.stderr);
    assert.ok(result.stderr.includes('builder >=1.4 required'),result.stderr);
    assert.equal(existsSync(join(dir,'dist')),false);
    assert.equal(existsSync(join(dir,'build')),false);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
