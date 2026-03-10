# TON Blockchain Wallet

Manage TON blockchain wallet operations including registry-backed wallet selection, balance queries, transfers, swaps, NFTs, DNS resolution, and agentic wallet onboarding.

## When to Use

Use this skill when the user wants to:
- Check wallet info, TON or token balances
- Work with multiple stored wallets or switch the active wallet
- Import wallets into the local TON config registry
- Configure network settings for MCP registry mode
- Send TON, Jettons (tokens), or NFTs
- Swap tokens on DEX
- View transaction history
- Resolve TON DNS-compatible domains
- Import, validate, or finish setup of an agentic wallet

## Tools Available

### Wallet & Balance
- `get_wallet` - Get wallet address and network info
- `get_balance` - Get TON balance
- `get_balance_by_address` - Get TON balance for any address
- `get_jetton_balance` - Get specific token balance (needs `jettonAddress`)
- `get_jettons` - List all tokens in wallet
- `get_jettons_by_address` - List all tokens for any owner address
- `get_jetton_info` - Get jetton metadata by master contract address
- `get_jetton_wallet_address` - Get jetton-wallet address for owner + jetton
- `get_transactions` - View recent transactions (optional `limit`)
- `get_transaction_status` - Check completion status of a sent transaction by normalized hash
- `get_known_jettons` - Get list of popular tokens with addresses

### Wallet Registry Management
- `list_wallets` - List wallets stored in the local config registry
- `get_current_wallet` - Get the active wallet from the local registry
- `set_active_wallet` - Switch active wallet by id, name, or address
- `import_wallet_from_mnemonic` - Import a standard wallet into the registry and make it active
- `import_wallet_from_private_key` - Import a standard wallet from private key and make it active
- `remove_wallet` - Remove a stored wallet from the registry
- `reset_wallet_config` - Delete the local registry config file
- `get_network_config` - Read Toncenter/API and agentic collection settings for a network
- `set_network_config` - Update Toncenter/API and agentic collection settings for a network

### Agentic Wallet Management
- `preflight_validate_agentic_wallet` - Cheap preflight check for contract type before deeper parsing/onboarding
- `validate_agentic_wallet` - Validate an agentic wallet against network/collection and optional owner
- `list_agentic_wallets_by_owner` - Find agentic wallets owned by a given main wallet
- `add_agent_wallet` - Import an existing agentic wallet into the registry
- `set_agentic_operator_private_key` - Attach or replace the operator private key for an imported agentic wallet

### Agentic Onboarding
- `start_agentic_root_wallet_setup` - Create pending setup, generate operator keys, and return a dashboard URL
- `list_pending_agentic_root_wallet_setups` - List pending root-agent setup drafts
- `get_agentic_root_wallet_setup` - Read one pending setup by `setupId`
- `complete_agentic_root_wallet_setup` - Finish onboarding from callback state or manual wallet address
- `cancel_agentic_root_wallet_setup` - Cancel a pending setup

### Transfers
- `send_ton` - Send TON (`toAddress`, `amount` in TON like "1.5", optional `comment`); returns top-level `normalizedHash`
- `send_jetton` - Send tokens (`toAddress`, `jettonAddress`, `amount`, optional `comment`); returns top-level `normalizedHash`
- `send_nft` - Transfer NFT (`nftAddress`, `toAddress`, optional `comment`)
- `send_raw_transaction` - Advanced: send raw transaction with multiple messages; returns top-level `normalizedHash`

### Swaps
- `get_swap_quote` - Get swap quote (`fromToken`, `toToken`, `amount` in human-readable format)
  - Use "TON" or jetton address for tokens
  - Returns transaction params for `send_raw_transaction`

### NFTs
- `get_nfts` - List wallet NFTs (optional `limit`, `offset`)
- `get_nfts_by_address` - List NFTs for any owner address
- `get_nft` - Get NFT details (`nftAddress`)

### DNS
- `resolve_dns` - Resolve TON DNS-compatible domain to address (`domain` like "foundation.ton" or "viqex.t.me")
- `back_resolve_dns` - Find domain for address (`address`)

## Common Workflows

### Check Balance
1. Call `get_wallet` for address and network
2. Call `get_balance` for TON
3. Call `get_jettons` for all tokens

### Work With Multiple Wallets
1. Call `list_wallets` to inspect stored wallets
2. Call `get_current_wallet` to confirm the active wallet
3. If needed, call `set_active_wallet`
4. For one-off calls, pass `walletSelector` directly to wallet-scoped tools instead of changing active wallet

### Import Standard Wallet Into Registry
1. Use `import_wallet_from_mnemonic` or `import_wallet_from_private_key`
2. Confirm the imported wallet via `get_current_wallet` or `list_wallets`
3. Use wallet-scoped tools normally; in registry mode they target the active wallet unless `walletSelector` is provided

### Send TON
1. If user provides a DNS name instead of a raw address, call `resolve_dns` first
2. Call `send_ton` with address and amount
3. By default, poll `get_transaction_status` until status is completed or failed. User can ask to skip.

### Send Token
1. Call `get_jettons` to find token address and verify balance
2. Call `send_jetton` with token address and amount
3. By default, poll `get_transaction_status` until status is completed or failed. User can ask to skip.

### Swap Tokens
1. Call `get_known_jettons` if user mentions token by name
2. Call `get_swap_quote` to get quote and transaction params
3. Show quote to user and ask for confirmation
4. Call `send_raw_transaction` with the transaction params
5. By default, poll `get_transaction_status` until status is completed or failed. User can ask to skip.

### Import Existing Agentic Wallet
1. Call `preflight_validate_agentic_wallet` first if you want a cheap contract-type check
2. Call `validate_agentic_wallet` if the user only has an address and you need full validation
3. Call `add_agent_wallet` to import it into the registry
4. If the wallet cannot sign yet, call `set_agentic_operator_private_key`
5. Only after that use write tools such as `send_ton`, `send_nft`, or `deploy_agentic_subwallet`

### Set Up First Agentic Root Wallet
1. Call `start_agentic_root_wallet_setup`
2. Tell the user to open the returned dashboard URL and create the wallet from their main wallet
3. Poll `get_agentic_root_wallet_setup` or inspect `list_pending_agentic_root_wallet_setups`
4. If completion is manual, `preflight_validate_agentic_wallet` is the fastest way to reject a wrong address before full validation
5. Call `complete_agentic_root_wallet_setup` when callback data is available or when the user provides the created wallet address
6. Confirm the imported wallet with `get_current_wallet` or `list_wallets`

## Notes

- Amounts for `send_ton`, `send_jetton`, and `get_swap_quote` are human-readable (e.g., "1.5" = 1.5 TON)
- In registry mode, wallet-scoped tools can accept optional `walletSelector`; otherwise they use the active wallet
- Registry mode uses the local TON config file from `~/.config/ton/config.json` or `TON_CONFIG_PATH`
- Agentic onboarding callback state is persisted in the local config; in stdio mode use `AGENTIC_CALLBACK_BASE_URL` and/or `AGENTIC_CALLBACK_PORT` when you need a stable callback endpoint across restarts
- Management tool responses are sanitized and do not expose mnemonic, private keys, operator private keys, or Toncenter API keys
- Read tools can work with imported agentic wallets that do not yet have `operator_private_key`; write tools cannot
- Always confirm with user before executing transfers or swaps
- **Default flow:** After sending, poll `get_transaction_status` until completed or failed. User can specify whether to check status.
