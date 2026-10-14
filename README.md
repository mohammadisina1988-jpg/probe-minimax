# ProbeMinimax

A standalone GenLayer primitive for minimum-worst-case-cost adaptive diagnostics from published prose profiles.

The contract fixes Boolean probe predicates, positive integer costs and a budget. Anyone submits a commit-pinned publisher profile set. Leader and validators fetch complete documents and independently classify each expected outcome as YES, NO or UNKNOWN. Exact cell agreement and a substantive paragraph-anchor audit gate storage. An exact minimax compiler then chooses which probe to ask next for each answer path.

UNKNOWN retains a profile on both branches. The compiler either produces a complete budget-feasible tree, records the optimal cost exceeding the budget, or gives a concrete indistinguishable pair with a shared answer sequence. It never treats missing documentation as NO or drops uncertain profiles to fabricate a cheaper policy.

Gasless StudioNet deployment (chain 61999): **`0x8dec44265b80BF6C0eB59139C6ef6F112f0Bc0D2`**. [Deployment transaction](https://explorer-studio.genlayer.com/tx/0x918f58512fa692b48623e41f2287a03fa386eaebb43a1ef708a271fa9e846b7b) · [Four finalized scenarios and commitment rejection](proofs/README.md) · [Passing proof workflow](https://github.com/mohammadisina1988-jpg/probe-minimax/actions/runs/38471576994) · [Submission text](docs/submission.md).

## Example

Four documented API modes can be separated by asking the one-unit metadata question first, then choosing the appropriate two-unit capability question. The adaptive worst-case cost is **3**. Every fixed ordering of these three probes costs **5** in the worst case. A separate fixture has an UNKNOWN that overlaps both root branches yet still allows a complete three-unit policy.

## Files

- [Pinned contract](contracts/probe_minimax.py)
- [Architecture, consensus and trust boundaries](docs/architecture.md)
- [Probe policy](config/probes.json), [synthetic profiles](profiles)
- [Direct tests](tests/direct/test_planner.py)
- [Deployment and live proofs](proofs/README.md)

## Check

```sh
python -m pip install -r requirements-dev.txt
genvm-lint check contracts/probe_minimax.py --json
python -m pytest tests/direct -q
node scripts/check-fixtures.cjs
```

The 45 tests execute the real direct contract and explicitly replay validator callbacks with mocked web/LLM responses. The planner is also compared with exhaustive enumeration of all decision trees over 810 small ternary tables and 96 three-probe samples. Direct tests are not distributed-consensus proofs; live receipts are recorded separately.

## Interface

| Method | Behavior |
| --- | --- |
| Constructor | Fixed repository, JSON probe array `{id,question,cost}`, positive budget |
| `compile(url,sha256)` | Acquire profiles, obtain consensus matrix, append compiled policy/witness |
| `get_state()` | Configuration and complete source-bound batches |
| `walk(index,answers)` | Read-only interpretation of hypothetical YES/NO answers along a READY tree |

The scope is closed-catalogue planning, not diagnosis of a real deployment. `walk` does not run probes, verify caller observations, or attest service behavior. Publisher profiles are statements; hashes establish bytes rather than truth or independent authorship. Costs are configured policy units, not measured time or gas. Limits and exhaustion risks are documented in the architecture note.

This implementation uses established minimax planning. Its contract mechanism, fixtures, ternary-overlap handling, witnesses and solver tests are purpose-built. Generic JSON CLI transport and Windows direct-test compatibility scaffolding are adapted from earlier repositories; no earlier contract or transaction proof is reused.

## Reproduce live proofs

The manual **StudioNet proofs** workflow pins CLI 0.39.2, runs lint/direct tests, creates a disposable encrypted CLI account, and deploys fresh or recovers an explicitly supplied deployment hash. It signs only gasless StudioNet calls. Proof artifacts contain sanitized receipts, state, walks and recovery hashes; signing material and CLI journals are excluded.

For local use, install the pinned CLI, set `GENLAYER_CLI_PATH` to its `genlayer/dist/index.js`, and use an unlocked dedicated StudioNet account. Run `node scripts/live-proof.cjs`, then `node scripts/verify-proofs.cjs`. To recover an existing deployment, set `PROBE_RESUME_DEPLOY_TX`. Recover known writes with `PROBE_RESUME_WRITES` from the `hashes` object in `proofs/resume.json`, excluding the deployment entry. Never blindly resubmit a write when its outcome is uncertain. Existing state without its exact saved hash aborts the runner.
