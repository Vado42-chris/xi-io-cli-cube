# Local-only native CLI installer candidate

`installer_adapter.py` accepts one JSON request on stdin and emits one
`{ok,result/error}` JSON response. Invoke with `/usr/bin/python3 -I` and the
absolute bundled adapter path. Imports are fixed to adjacent `kernel/`, never
user-selected paths. Bundle sibling `../cli-source/` unchanged as well.

This is the editable local DEV composition, not a LIVE or connected distribution.
Its source adoption does not establish owner acceptance or broker admission.
Upstream CLI source is pinned in `../cli-source/SOURCE.json`; six payload files
are Git-blob-identical. Only `install.mjs` is adapted: `--packaged-source` verifies
all manifest files into memory before destination effects, then supplies bytes
to the existing generation/receipt/launcher/pointer implementation. No gh or
network is needed. Installer kernel modules are copied unchanged from
`xi-io_installer@15ce1769b773b3882e3f3965945ca91a29df98ec`.

CLI owns its generation/launcher/pointer mutations and previous-generation rollback.
The connection files and finite launcher use the existing kernel manifest and
transaction receipt, not a new copy/rollback engine. Connection is applied first;
if CLI fails while its prior current pointer is preserved, the existing kernel
rolls back connection changes. Changed/uncertain CLI pointers remain UNKNOWN for
reconciliation; there is no false cross-component atomicity claim.
The kernel's `OperationJournal` owns started/terminal/unknown operation evidence.
Native plan JSON holds immutable review input and is not a second outcome ledger.
Prepare does not write the target. Plan binds packaged bytes, selected Node hash,
exact destination tree, and review digest. Apply requires explicit exact approval.
All requests share a nonblocking process lock. Interrupted operations are not
retried automatically. Current readback additionally reopens installed bytes,
checks exact launcher, pinned Node, generation, all destination modes/tree digest,
and actually runs installed CLI `version` in disposable isolated configuration.

CLI now includes its mandatory Switchboard native-consumer connection dependency.
`component_availability` still disables unrelated BINS and full Switchboard product
installation; that does not disable the required connection runtime. Each plan
contains `connection.required=true`, exact source/blob/hash custody and its
existing-kernel manifest/plan. No production ports or credentials are fabricated. This installs no
services, models, credentials, remote connection, third-party app configuration,
or PATH edits. Launch the CLI through `<selected-prefix>/bin/xi-io-cli`.
The required connection entry is `<selected-prefix>/bin/xi-io-connect`: it accepts
no arguments and invokes only the existing pinned consumer `--once` with Node
`--experimental-strip-types` (for operational-job.ts). Without the existing
XIIO_DEVICE_REF, XIIO_DEVICE_BROKER_URL and XIIO_DEVICE_PORTS_MODULE bindings it
returns CONFIGURATION_REQUIRED. Installing bytes never establishes a session or
authorizes a job. The installer neither reads credentials nor executes a
configured connection; that remains separate explicit host admission.

## Intentional limitations

- Fresh installation has no prior CLI generation; `rollback_available=false`.
  Existing CLI rollback restores previous generation pointers on upgrades, retaining
  history. It is not uninstallation. UI must label/disable accordingly.
- Cross-process lock covers this adapter. CLI's own pointer locks/CAS are retained.
  An unrelated local writer that ignores locks can still race between filesystem
  observation and writes; this is not an adversarial same-user filesystem sandbox.
- Uncertain effects require reconciliation; the adapter refuses repeat effects
  rather than inferring success from plausible installed bytes.
- Only Linux local candidate tested. No Windows/macOS or Aries installed claims.

## Tests

`python3 native/hex/adapter/test_adapter.py` (from repository root).
Tests use actual pinned payload and disposable HOME/state/prefix only. Includes
fresh install/version/readback, no-prefix-effect prepare, duplicate denial,
upgrade and actual CLI rollback, approval/destination drift rejection, unsupported
component denial, IPC extra-field denial, lock exclusion, corrupt evidence denial,
and changed launcher rejection before execution.

`python3 adapter/test_connection_profile.py` installs the actual five-file closure,
imports the real TS dependency under the selected Node, observes unconfigured
launcher refusal without network, independently reopens bytes, uses kernel
rollback, and injects CLI failure to prove prior CLI preservation plus truthful
unknown/no-retry state. Runtime tested here: Node24.22.1, not a Node22 host claim.

## Existing setup controls and bounded preflight

`inspect` now returns `system_metadata`, `node_candidates`, `node_suggestion`,
`existing_cli` and `connection_prerequisites`; `prepare` retains those observations
in its immutable review. Uses existing kernel semantic-root/executable-role
helpers without calling discovered executables. NVM enumeration is restricted to
`~/.nvm/versions/node/*/bin/node`, capped at64 directory entries and12 versions;
only `/usr/bin/node` and `/usr/local/bin/node` are additional candidates. Runtime
execution still occurs only for the user's explicitly selected Prepare action.
The known CLI receipt and public device.json refs are read narrowly, not private
keys, credential values or ports-module code. Missing process binding observation
is NOT a statement that the service/session is absent.

The original App workspace chooser now invokes `native_select_directory` with
purpose `workspace`; the installation-prefix chooser uses `installation`. No
sample path, browser fallback or permission inference. ABI for installer_request
is unchanged. Tests: `test_install_preflight.py`, frontend
`test/native-directory.test.mjs`, `test/installer-availability.test.mjs`.

## Exact PR15 existing-launcher repair (separate from generation installation)

The same adapter and native installer bundle now expose a launcher-only plan.
`../cli-source/launcher-repair.install.mjs` is **unchanged** upstream
`Vado42-chris/xi-io-cli@b56adb5cbf34bcd9102f46df297aa42395ef41eb`, SHA256
`118a7df1e952602aaf9b9c93d4e8aae62c527f15150463e8b2cb0645da3ab137`.
It is a separately named immutable resource, not a second installer engine or a
replacement for the existing `--packaged-source` transport adaptation. Custody is
in `launcher-repair.SOURCE.json`; adapter constants independently enforce both
installer and canonical verifier hashes. Native resource-directory packaging
already includes it. No runtime download, generation staging, connection setup,
PATH edit, service start or third-party application change is part of repair.

JSON API (same finite stdin/stdout protocol):

- `prepare_repair`: `{action, prefix, node, bin_dir}`; all paths explicit and
  absolute. `bin_dir` is the **actual** launcher directory, which may be outside
  the generation prefix (for example the user's `.local/bin`). `inspect` provides
  `bin_dir_suggestion`, but repair never silently substitutes `prefix/bin`.
- `apply_repair`: `{action, plan_id, approval_digest, approved:true}`. No arbitrary
  source, command, node override or target override is accepted at apply time.
- Existing `inspect` and `readback`: `{action, plan_id}`. A repair plan has
  `kind="launcher_repair"`; install/rollback/local-task actions cannot consume it.

Preparation verifies the selected existing actual Node executable is 22.13+,
imports unchanged hash-qualified PR15 `src/runtime-integrity.mjs` for both
current and previous generation/receipt verification, and binds an entire-prefix
snapshot. It does **not** execute the existing possibly broken launcher. The plan
also binds original launcher bytes/SHA/inode/owner/mode, launcher directory
identity, exact source, exact expected canonical output digest, and immutable
approval digest. The independent output-template check is read-only; it never
writes launcher bytes. Only upstream `--repair-launcher` mutates the launcher,
creates its exact backup and owns durable transaction recovery. For an explicitly
selected launcher inside the prefix, preservation excludes only that launcher and
its exact canonical backup; all generations, pointers and receipts remain bound.

The adapter rechecks approved inputs before starting its existing
`OperationJournal`. Drift, unknown history, pointer/repair transactions, untrusted
filesystem custody, backup conflicts or unresolved prior repair outcomes stop
before canonical execution. After execution it independently verifies the entire
prefix preservation snapshot, exact launcher bytes pinned to the approved Node,
original backup and metadata, then runs the **actual launcher** `version` in an
isolated disposable configuration. The result is
`LAUNCHER_REPAIR_READBACK_VERIFIED`, not full CLI acceptance: doctor/local-read,
connection and end-to-end workflow verification remain explicitly false/unclaimed.

Phases: `PREPARED_REPAIR_NOT_APPLIED`,
`LAUNCHER_REPAIR_READBACK_VERIFIED`, `LAUNCHER_REPAIR_OUTCOME_UNCERTAIN`.
Post-start failure, lost response, incomplete or unknown evidence cannot be
silently retried or bypassed with a fresh plan. Inspection returns
`do_not_retry=true`, `recovery_required=true`, and exact canonical recovery
resource/target metadata; it performs no recovery. An operator must explicitly
review and run canonical recovery where appropriate. Canonical recovery restores
the original launcher; it neither completes repair nor erases the adapter's
uncertain journal. A normal successful plan has no launcher rollback action.

### Reproducible executable integration tests

```
python3 native/hex/adapter/test_launcher_repair.py
python3 -B -m unittest discover -s native/hex/adapter -p 'test_*.py'
```

The repo-local `tests/fixtures/cli-launcher-repair-pr15/` is the unchanged upstream
helper plus exact installer and six real payload files, with custody manifest.
It lives outside shipped native resources. The helper performs two real offline
installs with fixture-only transport; neither the repair nor the CLI is mocked.
`XIIO_REPAIR_FIXTURE_ROOT=/path/to/exact-PR15-checkout` optionally tests an
independent checkout; hashes must match, and missing fixture material fails rather
than skipping. Cases cover actual outside-prefix and inside-prefix launchers,
current/previous receipt and payload preservation, selected Node/launcher/source/
verifier/pointer drift, custody, explicit approval, quoted paths, post-effect lost
response, SIGKILL canonical durable recovery, unknown journal/no-retry behavior,
and refusal to execute a later tampered launcher. All filesystem effects are in
disposable test fixtures, never the user's installed CLI or application profiles.
