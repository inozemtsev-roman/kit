/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { z } from 'zod';

import { WalletRegistryService } from '../services/WalletRegistryService.js';
import { normalizeNetwork } from '../registry/config.js';
import { sanitizeNetworkConfig, sanitizeWallet, sanitizeWallets } from './sanitize.js';
import type { ToolResponse } from './types.js';

function successResponse(data: unknown): ToolResponse {
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify({ success: true, ...((data as object | null) ?? {}) }, null, 2),
            },
        ],
    };
}

function errorResponse(error: unknown): ToolResponse {
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify(
                    {
                        success: false,
                        error: error instanceof Error ? error.message : 'Unknown error',
                    },
                    null,
                    2,
                ),
            },
        ],
        isError: true,
    };
}

const getNetworkConfigSchema = z.object({
    network: z.enum(['mainnet', 'testnet']).describe('Network to inspect'),
});

const setNetworkConfigSchema = z.object({
    network: z.enum(['mainnet', 'testnet']).describe('Network to update'),
    toncenterApiKey: z.string().optional().describe('Optional Toncenter API key for this network'),
    agenticCollectionAddress: z.string().optional().describe('Optional agentic collection address override'),
});

const setActiveWalletSchema = z.object({
    walletSelector: z.string().min(1).describe('Wallet id, name, or address'),
});

const importWalletFromMnemonicSchema = z.object({
    mnemonic: z.string().min(1).describe('24-word mnemonic phrase'),
    network: z.enum(['mainnet', 'testnet']).optional().describe('Target network (default: mainnet)'),
    walletVersion: z.enum(['v5r1', 'v4r2']).optional().describe('Wallet version to import (default: v5r1)'),
    name: z.string().optional().describe('Optional wallet display name'),
});

const importWalletFromPrivateKeySchema = z.object({
    privateKey: z.string().min(1).describe('32-byte or 64-byte hex private key'),
    network: z.enum(['mainnet', 'testnet']).optional().describe('Target network (default: mainnet)'),
    walletVersion: z.enum(['v5r1', 'v4r2']).optional().describe('Wallet version to import (default: v5r1)'),
    name: z.string().optional().describe('Optional wallet display name'),
});

const removeWalletSchema = z.object({
    walletSelector: z.string().min(1).describe('Wallet id, name, or address to remove'),
});

const validateAgenticWalletSchema = z.object({
    address: z.string().min(1).describe('Agentic wallet address'),
    network: z.enum(['mainnet', 'testnet']).optional().describe('Network to validate against (default: mainnet)'),
    collectionAddress: z.string().optional().describe('Optional collection address override'),
    ownerAddress: z.string().optional().describe('Optional owner address expectation'),
});

const preflightValidateAgenticWalletSchema = z.object({
    address: z.string().min(1).describe('Wallet address to preflight-check as an agentic wallet contract'),
    network: z.enum(['mainnet', 'testnet']).optional().describe('Network to validate against (default: mainnet)'),
});

const listAgenticWalletsByOwnerSchema = z.object({
    ownerAddress: z.string().min(1).describe('Owner wallet address'),
    network: z.enum(['mainnet', 'testnet']).optional().describe('Network to query (default: mainnet)'),
});

const addAgentWalletSchema = z.object({
    address: z.string().min(1).describe('Agentic wallet address'),
    network: z.enum(['mainnet', 'testnet']).optional().describe('Network to validate against (default: mainnet)'),
    name: z.string().optional().describe('Optional wallet display name'),
    operatorPrivateKey: z.string().optional().describe('Optional operator private key'),
});

const setAgenticOperatorPrivateKeySchema = z.object({
    walletSelector: z.string().min(1).describe('Agentic wallet id, name, or address'),
    privateKey: z.string().min(1).describe('Operator private key'),
});

export function createMcpWalletManagementTools(registry: WalletRegistryService) {
    return {
        list_wallets: {
            description: 'List all wallets stored in the local TON config registry.',
            inputSchema: z.object({}),
            handler: async (): Promise<ToolResponse> => {
                try {
                    const wallets = await registry.listWallets();
                    const current = await registry.getCurrentWallet();
                    return successResponse({
                        wallets: sanitizeWallets(wallets),
                        count: wallets.length,
                        activeWalletId: current?.id ?? null,
                    });
                } catch (error) {
                    return errorResponse(error);
                }
            },
        },

        get_current_wallet: {
            description: 'Get the currently active wallet from the local TON config registry.',
            inputSchema: z.object({}),
            handler: async (): Promise<ToolResponse> => {
                try {
                    const wallet = await registry.getCurrentWallet();
                    return successResponse({ wallet: sanitizeWallet(wallet) });
                } catch (error) {
                    return errorResponse(error);
                }
            },
        },

        set_active_wallet: {
            description: 'Set the active wallet by id, name, or address.',
            inputSchema: setActiveWalletSchema,
            handler: async (args: z.infer<typeof setActiveWalletSchema>): Promise<ToolResponse> => {
                try {
                    const wallet = await registry.setActiveWallet(args.walletSelector);
                    return successResponse({ wallet: sanitizeWallet(wallet), activeWalletId: wallet.id });
                } catch (error) {
                    return errorResponse(error);
                }
            },
        },

        import_wallet_from_mnemonic: {
            description: 'Import a standard wallet from mnemonic into the local TON config registry and make it active.',
            inputSchema: importWalletFromMnemonicSchema,
            handler: async (args: z.infer<typeof importWalletFromMnemonicSchema>): Promise<ToolResponse> => {
                try {
                    const wallet = await registry.importWalletFromMnemonic(args);
                    return successResponse({ wallet: sanitizeWallet(wallet), activeWalletId: wallet.id });
                } catch (error) {
                    return errorResponse(error);
                }
            },
        },

        import_wallet_from_private_key: {
            description: 'Import a standard wallet from private key into the local TON config registry and make it active.',
            inputSchema: importWalletFromPrivateKeySchema,
            handler: async (args: z.infer<typeof importWalletFromPrivateKeySchema>): Promise<ToolResponse> => {
                try {
                    const wallet = await registry.importWalletFromPrivateKey(args);
                    return successResponse({ wallet: sanitizeWallet(wallet), activeWalletId: wallet.id });
                } catch (error) {
                    return errorResponse(error);
                }
            },
        },

        remove_wallet: {
            description: 'Remove a stored wallet from the local TON config registry.',
            inputSchema: removeWalletSchema,
            handler: async (args: z.infer<typeof removeWalletSchema>): Promise<ToolResponse> => {
                try {
                    const result = await registry.removeWallet(args.walletSelector);
                    return successResponse({
                        ...result,
                        removed: sanitizeWallet(result.removed),
                    });
                } catch (error) {
                    return errorResponse(error);
                }
            },
        },

        reset_wallet_config: {
            description: 'Delete the local TON config registry file.',
            inputSchema: z.object({}),
            handler: async (): Promise<ToolResponse> => {
                try {
                    await registry.resetConfig();
                    return successResponse({ message: 'Config deleted.' });
                } catch (error) {
                    return errorResponse(error);
                }
            },
        },

        get_network_config: {
            description: 'Get Toncenter and agentic collection settings for a network.',
            inputSchema: getNetworkConfigSchema,
            handler: async (args: z.infer<typeof getNetworkConfigSchema>): Promise<ToolResponse> => {
                try {
                    const config = await registry.getNetworkConfig(args.network);
                    return successResponse({
                        network: args.network,
                        config: sanitizeNetworkConfig(config),
                    });
                } catch (error) {
                    return errorResponse(error);
                }
            },
        },

        set_network_config: {
            description: 'Update Toncenter or agentic collection settings for a network.',
            inputSchema: setNetworkConfigSchema,
            handler: async (args: z.infer<typeof setNetworkConfigSchema>): Promise<ToolResponse> => {
                try {
                    const config = await registry.setNetworkConfig(args.network, {
                        ...(args.toncenterApiKey !== undefined ? { toncenter_api_key: args.toncenterApiKey } : {}),
                        ...(args.agenticCollectionAddress !== undefined
                            ? { agentic_collection_address: args.agenticCollectionAddress }
                            : {}),
                    });
                    return successResponse({
                        network: args.network,
                        config: sanitizeNetworkConfig(config),
                    });
                } catch (error) {
                    return errorResponse(error);
                }
            },
        },

        validate_agentic_wallet: {
            description: 'Validate an existing agentic wallet address against the expected network and collection.',
            inputSchema: validateAgenticWalletSchema,
            handler: async (args: z.infer<typeof validateAgenticWalletSchema>): Promise<ToolResponse> => {
                try {
                    const wallet = await registry.validateAgenticWallet(args);
                    return successResponse({ wallet });
                } catch (error) {
                    return errorResponse(error);
                }
            },
        },

        preflight_validate_agentic_wallet: {
            description:
                'Cheap preflight check that verifies an address is an active agentic wallet contract before deeper storage parsing or onboarding completion.',
            inputSchema: preflightValidateAgenticWalletSchema,
            handler: async (args: z.infer<typeof preflightValidateAgenticWalletSchema>): Promise<ToolResponse> => {
                try {
                    const result = await registry.preflightValidateAgenticWallet(args);
                    return successResponse({ result });
                } catch (error) {
                    return errorResponse(error);
                }
            },
        },

        list_agentic_wallets_by_owner: {
            description: 'List agentic wallets owned by a given main wallet address.',
            inputSchema: listAgenticWalletsByOwnerSchema,
            handler: async (args: z.infer<typeof listAgenticWalletsByOwnerSchema>): Promise<ToolResponse> => {
                try {
                    const wallets = await registry.listAgenticWalletsByOwner(args);
                    return successResponse({
                        ownerAddress: args.ownerAddress,
                        network: normalizeNetwork(args.network, 'mainnet'),
                        wallets,
                        count: wallets.length,
                    });
                } catch (error) {
                    return errorResponse(error);
                }
            },
        },

        add_agent_wallet: {
            description:
                'Import an existing agentic wallet into the local TON config registry, recovering a matching pending key draft when available.',
            inputSchema: addAgentWalletSchema,
            handler: async (args: z.infer<typeof addAgentWalletSchema>): Promise<ToolResponse> => {
                try {
                    const result = await registry.addAgentWallet(args);
                    return successResponse({
                        ...result,
                        wallet: sanitizeWallet(result.wallet),
                    });
                } catch (error) {
                    return errorResponse(error);
                }
            },
        },

        set_agentic_operator_private_key: {
            description: 'Attach or replace the operator private key for an imported agentic wallet.',
            inputSchema: setAgenticOperatorPrivateKeySchema,
            handler: async (args: z.infer<typeof setAgenticOperatorPrivateKeySchema>): Promise<ToolResponse> => {
                try {
                    const wallet = await registry.setAgenticOperatorPrivateKey({
                        selector: args.walletSelector,
                        privateKey: args.privateKey,
                    });
                    return successResponse({ wallet: sanitizeWallet(wallet) });
                } catch (error) {
                    return errorResponse(error);
                }
            },
        },
    };
}
