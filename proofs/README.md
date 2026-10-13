# Live proof status

Direct tests: 45 passed. [JUnit record](direct-tests.xml).

Deployment and live scenario receipts will be added after finalization, execution success, source equality and state verification. No deployment or distributed-consensus result is claimed by this initial source publication.

The [original deployment attempt](https://explorer-studio.genlayer.com/tx/0xb3130d0595431751fe546c766a3377e6b30b33802f10cc0859538e9bb044655a) finalized with execution ERROR and MAJORITY_AGREE because the CLI harness double-encoded its policy JSON. No contract was created. The [failed receipt](failed-original-deployment-receipt.json) is retained. The transport argument is corrected; the contract source is unchanged.
