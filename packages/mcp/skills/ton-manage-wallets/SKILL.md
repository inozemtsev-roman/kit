---
name: ton-manage-wallets
description: Manage multiple TON wallets, import agentic wallets and rotate operator keys. Use when the user wants to switch wallets, list wallets, import an existing wallet, rotate an operator key, or manage their wallet registry.
user-invocable: true
disable-model-invocation: false
---

# TON Wallet Management

Manage the local wallet registry and perform advanced agentic wallet operations including import and key rotation.

## MCP Tools

### Wallet Registry

| Tool | Required | Optional |
| ---- | -------- | -------- |
| `list_wallets` | — | — |
| `get_current_wallet` | — | — |
| `set_active_wallet` | `walletSelector` | — |
| `remove_wallet` | `walletSelector` | — |

### Agentic Wallet Management

| Tool | Required | Optional |
| ---- | -------- | -------- |
| `agentic_validate_wallet` | `address` | `network`, `ownerAddress`, `collectionAddress` |
| `agentic_list_wallets_by_owner` | `ownerAddress` | `network` |
| `agentic_import_wallet` | `address` | `name` |
| `agentic_rotate_operator_key` | `walletSelector` | — |
| `agentic_complete_rotate_operator_key` | `rotationId` | — |

## Workflows

### Switch Active Wallet
1. Call `list_wallets` to see all stored wallets
2. Call `set_active_wallet` with a `walletSelector` (id, name, or address)
3. Confirm with `get_current_wallet`

### Import Existing Agentic Wallet
1. Call `agentic_validate_wallet` to verify the wallet address and contract
2. Call `agentic_import_wallet` to add it to the registry
3. If the agent needs to sign transactions and no operator key is available, call `agentic_rotate_operator_key` and then `agentic_complete_rotate_operator_key` after the user applies the key change on-chain via the dashboard

### Rotate Operator Key
1. Call `agentic_rotate_operator_key` — generates a new key pair and returns a dashboard URL for the user to apply the change on-chain
2. Tell the user to open the dashboard link and confirm the key change
3. Call `agentic_complete_rotate_operator_key` with the `rotationId` once the on-chain change is confirmed

## Notes

- `walletSelector` accepts wallet id, name, or address
- For one-off queries, pass `walletSelector` directly to wallet-scoped tools instead of changing the active wallet
- Registry data is stored in `~/.config/ton/config.json` (or `TON_CONFIG_PATH`)
- Read tools work with imported agentic wallets that don't yet have an `operator_private_key`; write tools require it
- Management tool responses never expose private keys, mnemonics, or API keys
- To create a brand new agentic wallet, use the `ton-create-wallet` skill instead
