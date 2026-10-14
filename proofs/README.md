# StudioNet transaction proofs

Direct tests: 45 passed. [JUnit record](direct-tests.xml).

Contract: **`0x8dec44265b80BF6C0eB59139C6ef6F112f0Bc0D2`**. Network: gasless StudioNet, chain **61999**, a simulation network rather than Bradbury or mainnet.

The [successful workflow](https://github.com/mohammadisina1988-jpg/probe-minimax/actions/runs/38471576994) ran lint, 45 direct tests, offline forged-proof checks, deployment, four scenario writes and a tampered-commitment call. Its separate verifier fetched finalized receipts, deployed source bytes, live state and terminal walks again. [Verification summary](verification.json) · [Deployment configuration](deployment.json).

| Case | Result | Agree / disagree / idle | Transaction and receipt |
| --- | --- | --- | --- |
| Deployment | SUCCESS | 3 / 0 / 2 | [Transaction](https://explorer-studio.genlayer.com/tx/0x918f58512fa692b48623e41f2287a03fa386eaebb43a1ef708a271fa9e846b7b) · [receipt](deployment-receipt.json) |
| Adaptive | READY; optimal worst cost 3 | 3 / 0 / 2 | [Transaction](https://explorer-studio.genlayer.com/tx/0xcfa441a04f16b638fd07422cd13e0ecee19e01538624d568dc5b8ade584e0159) · [receipt](adaptive-receipt.json) · [state](adaptive.json) |
| Ambiguous | Indistinguishable pair and shared-answer witness | 3 / 0 / 2 | [Transaction](https://explorer-studio.genlayer.com/tx/0x9d2ceea7ee5b209c6f13129b7e0efb252eda8f6318a50f601377a51c09bf0e83) · [receipt](ambiguous-receipt.json) · [state](ambiguous.json) |
| Cost limit | Optimal cost 4 exceeds budget 3 | 3 / 0 / 2 | [Transaction](https://explorer-studio.genlayer.com/tx/0x96874afc3a7d4c06a16ac0b7b5f8909e8de5f2a08cf2a2893dcbd2975b4a5a3f) · [receipt](cost-limit-receipt.json) · [state](cost-limit.json) |
| UNKNOWN overlap | READY; uncertain profile retained on both branches; cost 3 | 3 / 2 / 0 | [Transaction](https://explorer-studio.genlayer.com/tx/0xca2ea128f5b5c82d383e4816c499770d8a4126a8d3123400fee3a5faaf635e8d) · [receipt](overlap-receipt.json) · [state](overlap.json) |
| Tampered hash | Expected execution ERROR; state unchanged | 3 / 0 / 2 | [Transaction](https://explorer-studio.genlayer.com/tx/0xe2c31f2dc119d099d4d9ac4d2d0d5d1117fbebb19e413d1feb3999fde45c4f84) · [receipt](tamper-receipt.json) · [state](tamper.json) |

Every transaction above finalized with MAJORITY_AGREE. The four scenario writes executed successfully. The overlap receipt preserves two dissenting votes; majority acceptance does not imply unanimity. The tampered-hash call intentionally failed with `[EXTERNAL] Source commitment mismatch`, retained in its [decoded receipt](tamper-decoded-receipt.json).

The verifier matched deployed code exactly to `contracts/probe_minimax.py`, SHA-256 `ae1ce291687ab276aa43eeb96d8b63f7b072cfe21f60e9fb31f211882614240f`. Profile URLs are pinned to source commit `39fee06ffab99a99ce4d4d3be11c80bd325d06df`. Independent enumeration checked the optimal costs and every tree branch, including UNKNOWN overlap. Saved state prefixes matched the four-batch live state. Eleven hypothetical walker reads are retained: [adaptive](adaptive-walks.json), [overlap](overlap-walks.json). Local artifact checks repeated receipt, source/hash, snapshot, minimax, walk and rejection-state bindings before publication.

These synthetic profiles demonstrate closed-catalogue planning. The walker interprets supplied answers; it does not execute probes or verify real service behavior. Costs are policy units. The rejected hash is a commitment-integrity check, not an additional successful policy compilation.

The [original deployment attempt](https://explorer-studio.genlayer.com/tx/0xb3130d0595431751fe546c766a3377e6b30b33802f10cc0859538e9bb044655a) finalized with execution ERROR and MAJORITY_AGREE because the CLI harness double-encoded its policy JSON. No contract was created. The [failed receipt](failed-original-deployment-receipt.json) is retained. The transport argument is corrected; the contract source is unchanged.
