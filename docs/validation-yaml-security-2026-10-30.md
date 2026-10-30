# Vendored YAML scalar ReDoS hardening — 2026-10-30

PR #2's CodeQL check reported four high-severity polynomial-regex findings in
`runtime/kubernetes/vendor/yaml`: two flow-scalar folding expressions, the
trailing block-newline expression, and the more-indented block-folding expression.
The original check is https://github.com/Teck-Lab/Teck.Orca/runs/124284270001.

## Change

The vendored package is updated from YAML 2.9.0 to the integrity-pinned 2.9.1
release. The published patch release still contains relevant fallback/scalar
expressions, so two explicit source patches replace those paths with linear
scanners. Flow unfolding follows the upstream index-based approach at
https://github.com/eemeli/yaml/blob/1420d2dbfecf43f89ff1bc6b3ca6e90db538155d/src/compose/resolve-flow-scalar.ts.
Block-newline indentation and more-indented folding use single-pass scans;
whitespace-run ends are cached so repeated indented empty lines cannot cause
repeated suffix scans. These preserve folded/literal scalar formatting.

`npm run vendor:yaml` reproduces the vendor tree from the exact published archive,
checks its pinned SHA512 before extraction, checks expected upstream file SHA256s
before applying the patches and records source/patched hashes plus the complete
vendor inventory in `provenance.json`. The ISC license remains included.
`npm run check` verifies vendor hashes and the hardening-source identity offline;
normal builds and startup never download or patch dependencies.

Plugin versions are 0.5.16 and native SSH preview 0.1.11. OMP, Bun and Orca pins,
network policy and active project sandbox contents are unchanged by this fix.

## Validation

Four adversarial tests exercise 200,000-character/line-run input through actual
public parsing/stringification. Child processes enforce a five-second bound so
synchronous regex stalls are interruptible. The legacy-engine fixture deliberately
rejects lookbehind to exercise the original fallback paths; the patched package
is tested with both this fixture and the normal Node engine.

Before the fix all four cases timed out at five seconds. After the fix the
same cases completed in approximately 0.2–0.5 seconds per case, including both
engine modes, with expected results and scalar round-trips.

A deterministic differential corpus of 7,466 scalar inputs produced 97,058
matching parse/format comparisons against the integrity-verified official 2.9.1
package. It includes exhaustive short whitespace/newline combinations plus
seeded CR, LF, tabs, quotes, Unicode separators and mixed-content cases. Twenty-two
representative upstream formatting fixtures are retained as ordinary regression
tests. Kubernetes bundle/layout tests also pass.

Scoped main-plugin build/check and all 156 tests passed. Native SSH preview
build/check and all 22 tests passed. The updated branch is reanalyzed by GitHub;
its current CodeQL security result is available in PR #2 checks. No alert
suppression or CodeQL scan exclusion is part of the fix.
