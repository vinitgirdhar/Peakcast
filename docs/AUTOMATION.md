# Automated checks and evidence

This is the requested documentation/verification automation. It does not create AWS Amplify resources, deploy the project or schedule recurring jobs.

## Run the complete local check

```powershell
npm ci
npx playwright install chromium webkit
npm run verify
```

`npm run verify` runs sequentially and stops at the first failure:

1. Prettier formatting.
2. Documentation links and required guide files.
3. Node unit, backend integration, SDK error and mocked provider-boundary tests; native Node coverage gates require at least 80% aggregate lines, branches and functions for the executed `server/` and `shared/` modules.
4. Strict TypeScript plus production frontend/server build.
5. Real loopback HTTP calls against the **compiled backend** through the shipped SDK, using a disposable in-memory database.
6. Desktop/mobile Chromium and mobile WebKit button/workflow tests against another isolated compiled backend on port 3101.
7. Dependency audit; moderate or higher reported advisories fail the run.

No paid inference, payment, real wallet transaction or user-data reset is performed. Browser journeys disable per-IP rate counting to keep many fresh test accounts from rate-limiting one test machine; separate security tests check actual limits with them enabled. Clipboard and install-dialog success/failure are controlled browser simulations, not OS/device tests.

## Output files

| Artifact                       | Contents                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------ |
| `output/verification.json`     | Current run start/finish, step result, exit code and duration; overwritten as the run progresses |
| `output/api-verification.json` | HTTP/SDK check groups; no credentials stored in the report                                       |
| `output/openapi.json`          | Checked machine-readable API contract                                                            |
| `playwright-report/index.html` | Browser journey report                                                                           |
| `test-results/`                | Failure context/traces when a browser check fails                                                |
| `output/ui-review.json`        | Additional axe/overflow/runtime-error checks when `review:ui` is run                             |
| `output/screenshots/`          | Additional UI/Windows screenshots                                                                |

Generated evidence is ignored by Git. Test traces can contain disposable demo tokens/request data; keep them private. The CI workflow uploads only test evidence, never `.env` or local databases. A pass reflects the code and environment at that run, not a permanent certification.

## Additional UI and Windows checks

```powershell
# Terminal 1, after a successful build
npm start

# Terminal 2
npm run review:ui
npm run desktop:package
npm run test:desktop
```

`review:ui` expects the local production web server on port 3001 and checks five screens at desktop/mobile sizes. The Windows smoke test checks two packaged launches, backend availability, refraction, renderer isolation and the same session after restart. Close any already-running Peakcast desktop instance before that check; a single-instance lock intentionally prevents duplicate desktop servers.

The Windows bundle must be rebuilt after source changes. Keep its entire folder together. Signing, installer/update distribution and physical-phone PWA installation are separate acceptance work.

## Continuous integration

`.github/workflows/verify.yml` prepares Node 22 and Chromium, then runs the same `npm run verify` on push, pull request or manual dispatch. It uses read-only repository permissions and saves evidence even on failure. It does not deploy. The workflow uses the current official [checkout](https://github.com/actions/checkout), [setup-node](https://github.com/actions/setup-node) and [upload-artifact](https://github.com/actions/upload-artifact) examples.

This workspace does not currently contain a Git repository/remote. The workflow file is prepared; no hosted CI run has been executed or represented as passing. Commit/push to the intended repository before expecting GitHub Actions to run. External runner/browser-download/network failures should be reported as failures, not silently converted to success.

## Uncovered boundaries

Live provider quality/availability, source truth, real funds, contracts, oracle settlement, wallet/KYC/fiat partners, public deployment, Safari/Firefox, physical devices, institutional load targets and full manual accessibility/device testing are outside these automated local checks. See [RFP status](RFP_STATUS.md).
