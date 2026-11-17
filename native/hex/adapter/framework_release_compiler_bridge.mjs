import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

const fail = code => { process.stderr.write(code + '\n'); process.exit(2); };
const modulePath = process.argv[2];
if (!modulePath) fail('FRAMEWORK_RELEASE_MODULE_REQUIRED');
let request;
try { request = JSON.parse(fs.readFileSync(0, 'utf8')); }
catch { fail('FRAMEWORK_RELEASE_REQUEST_INVALID'); }
let framework;
try { framework = await import(pathToFileURL(modulePath).href); }
catch { fail('FRAMEWORK_RELEASE_MODULE_IMPORT_FAILED'); }
if (typeof framework.compileReleaseDistributionLock !== 'function')
  fail('FRAMEWORK_RELEASE_COMPILER_EXPORT_MISSING');
try {
  const result = await framework.compileReleaseDistributionLock({
    product_ref: request.product_ref,
    consumer_ref: request.consumer_ref,
    readAcceptedRelease: async ({product_ref}) => {
      if (product_ref !== request.product_ref) throw new Error('RELEASE_PRODUCT_REBIND_REFUSED');
      return request.release;
    },
    readCurrentAdopter: async ({consumer_ref, product_ref}) => {
      if (consumer_ref !== request.consumer_ref || product_ref !== request.product_ref)
        throw new Error('ADOPTER_REBIND_REFUSED');
      return request.adopter;
    },
    readEntrypointQualification: async ({product_ref, release_generation}) => {
      if (product_ref !== request.product_ref || release_generation !== request.release?.release_generation)
        throw new Error('ENTRYPOINT_QUALIFICATION_REBIND_REFUSED');
      return request.entrypoint_qualification;
    },
  });
  process.stdout.write(JSON.stringify(result));
} catch (error) {
  process.stderr.write(String(error?.message || error) + '\n');
  process.exit(3);
}
