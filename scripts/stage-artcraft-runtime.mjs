import {lstatSync, readdirSync, mkdirSync, copyFileSync, existsSync, realpathSync} from 'node:fs';
import {join, resolve, relative} from 'node:path';
export function stageArtcraftRuntime(source, target) {
  if (existsSync(target)) throw new Error('ARTCRAFT_STAGING_ALREADY_EXISTS');
  if (lstatSync(source).isSymbolicLink() || realpathSync(source) !== resolve(source) ||
      realpathSync(resolve(target, '..')) !== resolve(target, '..'))
    throw new Error('ARTCRAFT_STAGING_SYMLINK_REFUSED');
  const src = realpathSync(source);
  const paths = [];
  function visit(dir) {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name), stat = lstatSync(path);
      if (stat.isSymbolicLink()) throw new Error('ARTCRAFT_STAGING_SYMLINK_REFUSED');
      if (stat.isDirectory()) visit(path);
      else if (stat.isFile() && /\.(js|wasm)$/.test(name)) paths.push(relative(src, path));
    }
  }
  visit(src);
  for (const required of ['launcher.js', 'launcher_bg.wasm'])
    if (!paths.includes(required)) throw new Error('ARTCRAFT_RUNTIME_ASSET_MISSING');
  // This fresh directory is never a merge into another owner's staged payload.
  mkdirSync(target);
  for (const path of paths) {
    const dest = join(target, path);
    mkdirSync(resolve(dest, '..'), {recursive: true});
    copyFileSync(join(src, path), dest);
  }
  return paths;
}
if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted')
    throw new Error('HOSTED_DONOR_STAGING_REQUIRED');
  const source = join(process.env.RUNNER_TEMP, 'hex-artcraft-hosted-donor');
  const parent = join(process.env.GITHUB_WORKSPACE, 'public', 'donor');
  mkdirSync(parent, {recursive: true});
  const paths = stageArtcraftRuntime(source, join(parent, 'artcraft-launcher-web'));
  console.log(JSON.stringify({state:'GENERATED_RUNTIME_ASSETS_STAGED_NOT_MOUNTED', paths}));
}
