import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';

const root='native/hex/carrier/';
const version='0.1.0-dev.10';
const read=path=>readFileSync(root+path,'utf8');
const config=JSON.parse(read('src-tauri/tauri.conf.json'));
const npm=JSON.parse(read('package.json'));
const npmLock=JSON.parse(read('package-lock.json'));
const cargo=read('src-tauri/Cargo.toml');
const cargoLock=read('src-tauri/Cargo.lock');
const pkgCargo=cargoLock.match(/\[\[package\]\]\s+name = "xi-io-hex-dev"\s+version = "([^"]+)"/)?.[1];

test('one distinct DEV10 identity across the actual source-built Debian carrier',()=>{
  assert.equal(config.version,version);
  assert.equal(npm.version,version);
  assert.equal(npmLock.version,version);
  assert.equal(npmLock.packages[''].version,version);
  assert.match(cargo,/\[package\][\s\S]*?version = "0\.1\.0-dev\.10"/);
  assert.equal(pkgCargo,version);
  assert.equal(config.productName,'XI-IO HEX DEV');
  assert.equal(config.identifier,'com.xiio.hex.dev');
  assert.match(config.bundle.shortDescription,/DEV10/);
  assert.doesNotMatch(config.bundle.longDescription,/Installs and tests only explicitly selected CLI payloads/);
});

test('the exact native payload keeps only existing adapter and CLI resources',()=>{
  assert.deepEqual(Object.keys(config.bundle.resources).sort(),['../../cli-source/','../runtime-adapter/']);
  assert.equal(config.bundle.active,true);
  assert.ok(config.bundle.targets.includes('deb'));
  assert.match(config.bundle.longDescription,/six exact owner-published payloads/);
  assert.match(config.bundle.longDescription,/qualified core-release lock/);
});

test('unpublished child assets do not become a fake qualified release lock',()=>{
  const lock=root+'../adapter/core-release.lock.json';
  if(existsSync(lock)){
    const value=JSON.parse(readFileSync(lock,'utf8'));
    assert.equal(value.fixture,false);
    assert.deepEqual(value.products.map(p=>p.role).sort(),['bins','cli','ibal','inbox','switchboard','ward']);
  } else {
    const source=readFileSync('native/hex/adapter/installer_adapter.py','utf8');
    assert.match(source,/BLOCKED_RELEASE_PROFILE_UNPUBLISHED/);
  }
});
