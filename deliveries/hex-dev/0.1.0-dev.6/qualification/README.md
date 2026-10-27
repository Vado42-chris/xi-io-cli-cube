# Transaction guard qualification

Bootstrap SHA256 e207664582a2c708ecfc51be6bac42e087fc8ec0ca125f0051d79f9e6febd1ed. Embedded guard matches apt-guard.py SHA256 0fd175293bbc520aa3b5282e3ff373f6bd3b21e38800b0dc1b3dc2a4b3af88bb.

Executed and independently replayed: bash syntax;13 mocked bootstrap refusal/approval cases;12 parser cases;3 real APT protocol cases in an isolated Ubuntu22 fixture. Positive actual APT action list passed the guard then deliberately stopped at non-writing fake-dpkg sentinel99. Changed approved version and unrelated package aborted at guard73 before sentinel. This proves actual-transaction hook integration without modifying installed software. It is not physical host installation.

real-apt-test.py is ONLY for the disposable fixture/container, not an owner's computer. It uses synthetic dpkg status and a non-writing dpkg sentinel. APT::Sandbox::User=root appears only in that mapped-root test namespace because it has no _apt UID mapping; it is absent from the shipped bootstrap. First namespace and --no-download test failures were retained locally; no product acceptance was inferred from them. The guard correctly refused APT **ERROR** input until the fixture supplied its local archive normally.

The bootstrap uses APT's v3 Pre-Install-Pkgs hook, native zero-wait locking, explicit Assume-Yes=false/quiet=0 and ConfigurePending=false. It validates actual unpack/configure actions, target version/architecture and approved old version; hashes the actual .deb via an opened descriptor. Unknown protocol/actions refuse before dpkg. The original preflight remains informational and does not reserve package state. No global apt configuration is modified or cleared. Standard OS triggers and pre-existing administrator-configured apt hooks are not reimplemented or claimed to be sandboxed by this guard.

Original DEV6 package and canonical CLI repair unchanged. External Instant/Extra High/delivery-builder votes are separate from these internal qualification results. No installation authorization or Aries acceptance is implied.
