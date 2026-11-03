#!/usr/bin/python3
"""Hosted-only Software initialization observation using existing native guards."""
import importlib.util
import json
import os
from pathlib import Path
import sys

spec = importlib.util.spec_from_file_location('hex_native', Path(__file__).with_name('verify-installed-snap55.py'))
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)

class Software(base.Native):
    def __init__(self, pid, window, elf, source, proof, executable):
        candidate = Path(executable)
        temp = Path(os.environ.get('RUNNER_TEMP', '/NONEXISTENT')).resolve()
        base.require(candidate.is_absolute() and candidate.is_file() and
                     not any(p.is_symlink() for p in [candidate, *candidate.parents]), 'EXTRACTED_EXECUTABLE_REQUIRED')
        base.require(candidate.resolve().is_relative_to(temp) and
                     candidate.parts[-3:] == ('usr', 'bin', 'xi-io-hex-dev'), 'EXTRACTED_EXECUTABLE_REQUIRED')
        self.expected_executable = str(candidate.resolve())
        super().__init__(pid, window, elf, source, proof)

    def initialized(self):
        nodes = self.nodes()
        matches = [n for n in nodes if n.get_name() == 'HEX software marketplace initialized' and n.get_role() == self.ax.Role.STATUS_BAR and self.visible(n)]
        if not matches:
            # Bounded allowlisted failure categories only, never an AX tree dump.
            for node in nodes:
                if not self.visible(node): continue
                name = node.get_name() or ''
                if name in {'ARTCRAFT_MODULE_LOADER_UNBOUND','ARTCRAFT_GENERATED_EXPORTS_UNBOUND','ARTCRAFT_DONOR_EXPORT_UNBOUND','ARTCRAFT_DONOR_HANDLE_INVALID','ARTCRAFT_CLEANUP_UNVERIFIED','ARTCRAFT_RUNNER_START_FAILED','ARTCRAFT_LOCAL_MODULE_IMPORT_FAILED','ARTCRAFT_LOCAL_WASM_INITIALIZATION_FAILED','ARTCRAFT_LOCAL_MODULE_IMPORT_FAILED_WITH_LOCAL_POLICY_EVENT','ARTCRAFT_LOCAL_WASM_INITIALIZATION_FAILED_WITH_LOCAL_FETCH_POLICY_EVENT','ARTCRAFT_LOCAL_WASM_INITIALIZATION_FAILED_WITH_UNATTRIBUTED_COMPILE_POLICY_EVENT'}:
                    raise base.Unverified(name)
        base.require(len(matches) == 1, 'ARTCRAFT_INITIALIZATION_NOT_OBSERVED')
        return True

    def run(self):
        self.stage = 'software-navigation-control'
        self.command(['xdotool', 'windowfocus', '--sync', self.window])
        roles = [self.ax.Role.PUSH_BUTTON, self.ax.Role.PAGE_TAB]
        self.click(self.wait(lambda: self.find('Software', roles)))
        self.stage = 'software-generated-module-initialization'
        self.wait(self.initialized)
        self.stage = 'software-initialized-capture'
        return self.capture('software-initialized')

def main():
    receipt = {'schema':'xiio.hex.extracted-artcraft-initialization/v1','status':'UNVERIFIED',
               'initialization_observed':False,'domain_action_verified':False,'installer_action_verified':False,
               'installed_package':False,'aries_install':False,'provider_effect':False}
    native = None
    proof = None
    try:
        base.require(os.environ.get('GITHUB_ACTIONS') == 'true' and os.environ.get('RUNNER_ENVIRONMENT') == 'github-hosted', 'DISPOSABLE_RUNNER_REQUIRED')
        pid, window, elf, source, directory, executable = sys.argv[1:]
        base.require(base.SOURCE.fullmatch(source) and base.DIGEST.fullmatch(elf), 'SOURCE_IDENTITY_REQUIRED')
        candidate = Path(directory)
        base.require(candidate.is_dir() and not any(p.is_symlink() for p in [candidate,*candidate.parents]), 'PROOF_DIRECTORY_INVALID')
        proof = candidate
        receipt.update(source_commit=source,native_elf_sha256=elf,input_backend='XTEST',readback_backend='AT-SPI')
        native = Software(int(pid),window,elf,source,directory,executable)
        receipt['screenshot_sha256'] = native.run()
        receipt.update(status='INITIALIZED',initialization_observed=True)
        code = 0
    except base.Unverified as error:
        receipt['failure_category'] = str(error)
        code = 61
    except Exception:
        receipt['failure_category'] = 'NATIVE_INITIALIZATION_PROVIDER_UNVERIFIED'
        code = 62
    if native is not None:
        receipt['last_stage'] = native.stage
        if code != 0:
            try: receipt['failure_screenshot_sha256'] = native.capture('software-unverified')
            except Exception: receipt['failure_capture_verified'] = False
    if proof is not None:
        path = proof/'software-initialization.json'
        with path.open('x') as handle: json.dump(receipt,handle,sort_keys=True)
        base.require(json.loads(path.read_text()) == receipt, 'RECEIPT_READBACK_MISMATCH')
    print('HEX_ARTCRAFT_'+receipt['status'])
    return code

if __name__ == '__main__': sys.exit(main())
