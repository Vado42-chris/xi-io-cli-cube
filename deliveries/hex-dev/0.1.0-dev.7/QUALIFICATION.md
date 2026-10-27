# DEV7 portable qualification

This directory contains the unchanged published bootstrap and package, portable tests, retained DEV6 references, and original execution evidence. No test installs the package on the host.

Run from this directory:

```sh
python3 -B transaction-guard/test_dev7_binding.py
python3 -B transaction-guard/test_guard.py
python3 -B transaction-guard/test_confirmation.py > confirmation-results.jsonl
```

The confirmation test uses only command mocks; its JSON summary must report `required_scenarios_pass: true` and no additional defects. Original final qualification was 4 binding + 12 guard + 19 mock cases. The portable binding test changes only its PACKAGE lookup to the adjacent `.deb`; its four cases were replayed against that exact copied artifact.

`qualification/original-executed-tests/` preserves the pre-portability test bytes. Historical logs retain their original paths and hashes. Publication, package installation and owner CLI acceptance are separate.
