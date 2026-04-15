---
name: ton-getgems-buy-nft
description: Buy NFTs on GetGems marketplace using the GetGems public API and TON MCP tools. Use when the user wants to buy an NFT on GetGems, purchase a collectible from GetGems, or mentions getgems.io in the context of buying NFTs.
user-invocable: true
disable-model-invocation: false
---

# Buy NFT on GetGems

Buy fixed-price NFTs from the [GetGems](https://getgems.io) marketplace. Authentication uses **TonProof** via the MCP `generate_ton_proof` tool, then GetGems API calls are made via `curl`, and the on-chain purchase uses existing MCP transaction tools.

> **API docs**: https://api.getgems.io/public-api/docs  
> **Base URL**: `https://api.getgems.io/public-api`

## Step 1 — Authenticate with GetGems

1. Call `generate_ton_proof` with `domain` = `"getgems.io"`, `payload` = `"getgems-llm"`.
2. POST the proof to GetGems to obtain a temporary token (valid for 2 days):
   ```bash
   curl -s -X POST "https://api.getgems.io/public-api/auth/ton-proof" \
     -H "Content-Type: application/json" \
     -d '{
       "address": "<proof.address>",
       "chain": "<proof.chain>",
       "walletStateInit": "<proof.walletStateInit>",
       "publicKey": "<proof.publicKey>",
       "timestamp": <proof.timestamp>,
       "domainLengthBytes": <proof.domainLengthBytes>,
       "domainValue": "<proof.domainValue>",
       "signature": "<proof.signature>",
       "payload": "<proof.payload>",
       "authApplication": "TON MCP"
     }'
   ```
3. Response: `{ "token": "<TOKEN>" }`. Use this token as the `Authorization` header for subsequent API calls.
4. Cache the token for the session — it lasts 2 days.

## Step 2 — Find the NFT

If the user already has the NFT address, skip to step 2b.

### 2a. Browse NFTs on sale in a collection

```bash
curl -s "https://api.getgems.io/public-api/v1/nfts/on-sale/<collectionAddress>?limit=10" \
  -H "Authorization: <TOKEN>"
```

Returns `{ "success": true, "response": { "items": [...], "cursor": "..." } }`. Each item includes `address`, `name`, `image`, and a `sale` object.

### 2b. Get NFT details

```bash
curl -s "https://api.getgems.io/public-api/v1/nft/<nftAddress>" \
  -H "Authorization: <TOKEN>"
```

Response contains `NftItemFull` with:
- `name`, `description`, `image` — display info
- `ownerAddress` — current owner
- `sale` — if present, the NFT is for sale. For fixed-price sales:
  - `sale.type` = `"FixPriceSale"`
  - `sale.fullPrice` — price in nanotons
  - `sale.currency` — price currency (`"TON"` etc.)
  - `sale.version` — **required** for the buy request
  - `sale.contractAddress` — the sale contract

If `sale` is absent, the NFT is not currently for sale.

## Step 3 — Build the buy transaction

```bash
curl -s -X POST "https://api.getgems.io/public-api/v1/nfts/buy-fix-price/<nftAddress>" \
  -H "Authorization: <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{ "version": "<sale.version>" }'
```

Response: `TransactionResponse`
```json
{
  "success": true,
  "response": {
    "uuid": "...",
    "from": "<buyer address or null>",
    "timeout": "<unix timestamp>",
    "list": [
      {
        "to": "<destination address>",
        "amount": "<nanotons>",
        "payload": "<base64 BOC or null>",
        "stateInit": "<base64 BOC or null>"
      }
    ]
  }
}
```

Map `response.list` to MCP `messages` format and `response.timeout` to `validUntil`.

## Step 4 — Execute on-chain

| Action | Tool |
| ------ | ---- |
| Dry-run | `emulate_transaction` |
| Confirm + send | `send_raw_transaction` |
| Poll status | `get_transaction_status` |

1. `emulate_transaction` with `messages` mapped from `response.list`:
   ```json
   {
     "messages": [
       {
         "address": "<list[].to>",
         "amount": "<list[].amount>",
         "payload": "<list[].payload or omit>",
         "stateInit": "<list[].stateInit or omit>"
       }
     ],
     "validUntil": <response.timeout as integer>
   }
   ```
2. Show the user: NFT name, collection, price in TON (convert nanotons by dividing by 1e9), emulation results.
3. Confirm once with the user before proceeding.
4. `send_raw_transaction` with the same `messages` and `validUntil`.
5. Poll `get_transaction_status` with the returned `normalizedHash` until `completed` or `failed`.

## MCP Tools

| Tool | Required | Optional |
| ---- | -------- | -------- |
| `generate_ton_proof` | `domain`, `payload` | `walletSelector` |
| `emulate_transaction` | `messages` | `validUntil` |
| `send_raw_transaction` | `messages` | `validUntil`, `walletSelector` |
| `get_transaction_status` | `normalizedHash` | — |

## CLI argument names (exact)

| Tool | Arg | CLI flag |
| ---- | --- | -------- |
| `generate_ton_proof` | domain | `--domain` |
| `generate_ton_proof` | payload | `--payload` |
| `emulate_transaction` | messages | `--messages` (JSON array) |
| `emulate_transaction` | validUntil | `--validUntil` |
| `send_raw_transaction` | messages | `--messages` (JSON array) |
| `send_raw_transaction` | validUntil | `--validUntil` |
| `get_transaction_status` | normalizedHash | `--normalizedHash` |

## Notes

- Always confirm with the user before executing `send_raw_transaction` — show NFT name, price, and emulation results.
- If the NFT is not on sale (`sale` field is absent), inform the user and do not proceed.
- The GetGems token expires after 2 days. If a request returns 401, re-authenticate.
- Alternatively, the user can obtain a permanent API key at https://getgems.io/public-api and pass it directly as the `Authorization` header, skipping the TonProof flow.
- `authApplication` in the auth request should identify the LLM / agent (e.g., `"TON MCP"`, `"ChatGPT 1.0"`).

## Relations

- Wallet setup: **`ton-create-wallet`** skill.
- Balance checks: **`ton-balance`** skill.
- NFT operations (view, send, list owned): **`ton-nfts`** skill.
