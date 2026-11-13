# Test-first implementation and coverage

Use this contract for code changes, including new features, behavior changes,
bug fixes and refactoring. Follow the target repository's frameworks, fixtures,
runner and CI conventions. For .NET, load unit/integration testing and execution
guidance only for the boundary or command being used.

## Before implementation

### Plan tests in layers

For a feature, map its acceptance criteria to the applicable layers before
dispatching implementation. Prefer this progression through small vertical
slices, rather than deferring all integration work until every unit is written:

| Layer | Evidence | Guidance |
| --- | --- | --- |
| Unit | Fast decisions, validation, calculations and state transitions without infrastructure | `dotnet-unit-testing` for .NET; existing frontend test framework for UI logic |
| Service integration | Actual API/handler behavior and committed database or broker effects | Testcontainers owns real dependencies; WebApplicationFactory hosts HTTP tests where needed; no Aspire startup in new tests at this layer |
| Application E2E | Real gateway, authentication and service-to-service wiring, including browser user journeys | Aspire owns the assembled stack; Playwright tests the UI and API tests cover non-browser journeys |
| Kubernetes deployment/E2E | Application running as pods using actual manifests, operators and cluster routing | Aspire-managed KIND, deployed candidate images and API/browser assertions against the cluster |

Implement logic with focused unit RED/GREEN, add integration RED/GREEN as each
real boundary is introduced, then verify the assembled user journey with E2E.
A persistence or wiring bug may need integration as its smallest reproducer;
do not manufacture a mock-only unit regression that cannot expose the defect.
Pure logic changes need not invent a browser journey. For user-facing feature
work, define the E2E acceptance scenario up front and run it before acceptance.

The planner records each relevant layer, owner and acceptance scenario. Executors
own their scoped unit/integration tests. Assign one integration owner for the
assembled feature's system/E2E checks against the exact candidate revision;
parallel workers must not each launch an identical full stack or reset shared
data. Reviewers verify the evidence and investigate gaps instead of repeating
unchanged successful runs. Ad-hoc browser exploration supplements, but does not
replace, a checked-in repeatable regression test.

Use the target repository's existing harness. For a new Aspire/.NET repository,
use xUnit and Testcontainers for focused integration, with WebApplicationFactory
when HTTP hosting is needed. Reserve Aspire for assembled application E2E and
the Kubernetes lane; do not add an Aspire startup alternative to new service
integration tests. Aspire owns E2E startup;
the test framework owns assertions. For the selected new Nx/Aspire design, keep
Bun and prefer TypeScript @nx/playwright for browser journeys, with C# backend
tests. Load the browser skill's Nx/Bun/Aspire reference for startup ownership,
affected selection and caching. Aspire-managed KIND is an optional deployment
test lane, not a prerequisite for every feature iteration. Keep repository paths
and names out of this reusable policy.
Reuse a suite fixture with isolated per-test state, run affected tests during
implementation, and broaden once the candidate is assembled. See the Aspire
testing reference in `dotnet-integration-testing` for ownership and isolation.

Translate acceptance criteria into observable behaviors and focused test cases.
Every new feature or behavior needs automated tests, including the important
success, rejection and boundary paths relevant to that change. A bug fix needs
a regression test reproducing the defect. Existing tests can establish a pure
refactor's behavior; add cases when the refactor exposes a genuine gap.

Use a small test-first cycle:

1. Add or update the smallest behavioral test for the next requirement.
2. Run it on the unfixed behavior and capture RED for the intended reason.
   Missing dependencies, a failed container pull, zero discovered tests or broken
   test setup do not demonstrate the behavior. Diagnose that layer first.
3. Implement the smallest change that makes the test GREEN.
4. Refactor while retaining the assertions and passing tests. Repeat for the
   next behavior, then run the relevant combined acceptance checks.

When literal test-first is impractical, explain the concrete reason and use the
strongest repeatable behavioral verification available. Do not claim RED/GREEN
without executing it, or treat an explanation as permission to omit tests for a
new feature. Documentation-only, generated-output-only and non-executable edits
use appropriate validation without manufacturing unit tests. Configuration and
wiring that change runtime behavior still need a behavioral or integration check.

## Test the actual boundary

Assert public results and externally visible effects. Test a real HTTP/auth,
database, migration, messaging or transport boundary when that is the contract.
Use isolated unit tests for logic that does not require infrastructure. Reuse
existing fixtures and targeted runs; do not restart an entire environment or
run every suite for each RED/GREEN step. Keep one clear resource owner.

Tests must be able to expose a plausible regression. Do not mock the behavior
being verified, replace an integration test with a tautological mock, write tests
that merely repeat implementation details, or assert only that a method ran.
Never remove a relevant assertion, skip a failing scenario or weaken expected
behavior just to reach GREEN. Update expectations only for a requirement-backed
behavior change and explain what changed. Retire obsolete tests only when their
behavior has genuinely been removed or replaced, preserving required coverage.

## Coverage must not regress

Capture a baseline from the verified PR/base revision and candidate coverage from
the intended implementation snapshot. Compare the same runner, test selection,
build configuration, collector, source scope and inclusion/exclusion rules.
Prefer existing CI artifacts or repository commands; create a scoped baseline
only when the existing evidence is insufficient. Reuse measurements until the
source or relevant test/configuration inputs change.

- Compare line and branch coverage separately where supported. Neither may drop
  in an affected module, or in the project/repository aggregate when measured.
  An aggregate improvement cannot excuse a regression in changed code.
- New executable behavior needs meaningful exercised assertions. Add coverage
  for relevant previously uncovered behavior and aim to increase it. Unchanged
  coverage is valid at 100% or when a well-tested refactor adds no behavior;
  no fabricated test-count or percentage increase is required.
- A percentage increase alone does not prove test quality. Review the behavior
  and assertions, including material failure cases; unrelated easy tests do not
  compensate for missing tests of the feature.
- Never lower thresholds, accept a lower baseline, add coverage exclusions or
  ignores, alter filters, skip tests or weaken assertions to conceal a decrease.
  A lower result, even after legitimate code removal, must be explained and
  resolved or explicitly accepted by the user before publication. Do not quietly
  redefine the metric or broaden scope into unrelated coverage work.
- Missing, partial or incomparable reports are unknown, not zero or a pass.
  Recollect with matching settings where possible. If tooling/baseline evidence
  remains unavailable, report the exact limitation and unresolved acceptance
  check; never claim that coverage was preserved or manufacture a percentage.

This is a delivery policy; use an existing CI coverage gate where available.
Do not invent a successful automated gate in a repository that has none, or
silently install/migrate coverage tooling just to produce a number.

## Evidence for delivery and review

Provide requirement -> test mapping, the actual RED/GREEN commands and outcomes,
relevant suite counts/skips, and baseline/candidate line and branch coverage with
report paths, scope and any unresolved limitation. Include the exact reviewed
snapshot. Reuse this evidence during independent review; rerun checks only for
changed inputs, a failed check or an unresolved concern.

Keep a concise durable evidence artifact using the repository's existing
convention or an Orca artifact, and pass its exact path/link in the handoff.
Include the real command outputs or report links needed to verify the claims.
The reviewer should not need to reconstruct RED/GREEN or coverage by searching
an entire terminal/session transcript. Update the artifact for changed inputs;
do not manufacture another test run merely to reformat accepted evidence.
