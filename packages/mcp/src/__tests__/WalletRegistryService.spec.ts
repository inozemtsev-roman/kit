/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    deriveStandardWalletAddress: vi.fn(),
    createMcpWalletServiceFromStoredWallet: vi.fn(),
    createApiClient: vi.fn(),
    preflightValidateAgenticWalletAddress: vi.fn(),
    validateAgenticWalletAddress: vi.fn(),
    listAgenticWalletsByOwner: vi.fn(),
    resolveOperatorCredentials: vi.fn(),
    buildAgenticDashboardLink: vi.fn((address: string) => `https://dashboard.test/agent/${address}`),
}));

vi.mock('../runtime/wallet-runtime.js', () => ({
    deriveStandardWalletAddress: mocks.deriveStandardWalletAddress,
    createMcpWalletServiceFromStoredWallet: mocks.createMcpWalletServiceFromStoredWallet,
}));

vi.mock('../utils/ton-client.js', () => ({
    createApiClient: mocks.createApiClient,
}));

vi.mock('../utils/agentic.js', () => ({
    preflightValidateAgenticWalletAddress: mocks.preflightValidateAgenticWalletAddress,
    validateAgenticWalletAddress: mocks.validateAgenticWalletAddress,
    listAgenticWalletsByOwner: mocks.listAgenticWalletsByOwner,
    resolveOperatorCredentials: mocks.resolveOperatorCredentials,
    buildAgenticDashboardLink: mocks.buildAgenticDashboardLink,
}));

import {
    DEFAULT_AGENTIC_COLLECTION_ADDRESS,
    createAgenticWalletRecord,
    createEmptyConfig,
    createPendingAgenticDeployment,
    createStandardWalletRecord,
    loadConfig,
    saveConfig,
    type StoredWallet,
} from '../registry/config.js';
import { WalletRegistryService } from '../services/WalletRegistryService.js';

describe('WalletRegistryService', () => {
    const mainAddress = 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c';
    const agentAddress = 'EQDSLOFVamNZzdy4LulclcCBEFkRReZ7WscBCLAw3Pg53kAk';
    const ownerAddress = DEFAULT_AGENTIC_COLLECTION_ADDRESS;
    const originalConfigPath = process.env.TON_CONFIG_PATH;
    let tempDir = '';

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), 'ton-mcp-wallet-registry-'));
        process.env.TON_CONFIG_PATH = join(tempDir, 'config.json');
        delete process.env.TONCENTER_API_KEY;

        mocks.deriveStandardWalletAddress.mockReset();
        mocks.createMcpWalletServiceFromStoredWallet.mockReset();
        mocks.createApiClient.mockReset();
        mocks.preflightValidateAgenticWalletAddress.mockReset();
        mocks.validateAgenticWalletAddress.mockReset();
        mocks.listAgenticWalletsByOwner.mockReset();
        mocks.resolveOperatorCredentials.mockReset();
        mocks.buildAgenticDashboardLink.mockClear();
        mocks.createApiClient.mockReturnValue({ kind: 'api-client' });
        mocks.preflightValidateAgenticWalletAddress.mockResolvedValue({
            address: agentAddress,
            network: 'mainnet',
            accountStatus: 'active',
            hasCode: true,
            codeHash: 'abc',
            expectedCodeHash: 'abc',
            contractType: 'agentic_wallet',
        });
        mocks.resolveOperatorCredentials.mockImplementation(async (privateKey: string, expectedPublicKey?: string) => ({
            privateKey: `normalized:${privateKey}`,
            publicKey: expectedPublicKey ?? '0xresolved',
        }));
    });

    afterEach(() => {
        if (originalConfigPath) {
            process.env.TON_CONFIG_PATH = originalConfigPath;
        } else {
            delete process.env.TON_CONFIG_PATH;
        }
        rmSync(tempDir, { recursive: true, force: true });
    });

    it('imports a standard wallet from mnemonic and makes it active', async () => {
        mocks.deriveStandardWalletAddress.mockResolvedValue(mainAddress);
        const registry = new WalletRegistryService();

        const wallet = await registry.importWalletFromMnemonic({
            mnemonic: 'abandon '.repeat(23) + 'about',
            name: 'Primary wallet',
        });

        expect(wallet.name).toBe('Primary wallet');
        expect(wallet.type).toBe('standard');
        expect(wallet.network).toBe('mainnet');
        expect(wallet.wallet_version).toBe('v5r1');
        expect(mocks.deriveStandardWalletAddress).toHaveBeenCalledWith({
            mnemonic: 'abandon '.repeat(23) + 'about',
            privateKey: undefined,
            network: 'mainnet',
            walletVersion: 'v5r1',
            toncenterApiKey: undefined,
        });

        const stored = loadConfig();
        expect(stored?.active_wallet_id).toBe(wallet.id);
        expect(stored?.wallets).toEqual([expect.objectContaining({ id: wallet.id, address: wallet.address })]);
    });

    it('persists per-network config updates', async () => {
        const registry = new WalletRegistryService();

        const updated = await registry.setNetworkConfig('testnet', {
            toncenter_api_key: 'test-key',
            agentic_collection_address: ownerAddress,
        });

        expect(updated.toncenter_api_key).toBe('test-key');
        expect(updated.agentic_collection_address).toBeDefined();
        await expect(registry.getNetworkConfig('testnet')).resolves.toEqual(updated);
    });

    it('uses runtime network overrides in registry mode', async () => {
        const registry = new WalletRegistryService(undefined, {
            mainnet: {
                apiKey: 'override-key',
            },
        });

        await expect(registry.getNetworkConfig('mainnet')).resolves.toEqual({
            toncenter_api_key: 'override-key',
            agentic_collection_address: expect.any(String),
        });
    });

    it('runs agentic wallet preflight checks with the selected network', async () => {
        const registry = new WalletRegistryService();

        const result = await registry.preflightValidateAgenticWallet({
            address: agentAddress,
            network: 'testnet',
        });

        expect(mocks.preflightValidateAgenticWalletAddress).toHaveBeenCalledWith({
            client: { kind: 'api-client' },
            address: agentAddress,
            network: 'testnet',
        });
        expect(result).toMatchObject({
            address: agentAddress,
            contractType: 'agentic_wallet',
        });
    });

    it('creates a wallet service for the selected wallet and passes the network api key', async () => {
        const standard = createStandardWalletRecord({
            name: 'Primary wallet',
            network: 'mainnet',
            walletVersion: 'v5r1',
            address: mainAddress,
            mnemonic: 'abandon '.repeat(23) + 'about',
        });
        saveConfig({
            ...createEmptyConfig(),
            active_wallet_id: standard.id,
            wallets: [standard],
            networks: {
                mainnet: {
                    toncenter_api_key: 'main-key',
                },
            },
        });

        const close = vi.fn();
        mocks.createMcpWalletServiceFromStoredWallet.mockResolvedValue({
            service: { getAddress: () => standard.address },
            close,
        });

        const registry = new WalletRegistryService();
        const context = await registry.createWalletService();

        expect(context.wallet).toMatchObject({ id: standard.id, address: standard.address });
        expect(context.close).toBe(close);
        expect(mocks.createMcpWalletServiceFromStoredWallet).toHaveBeenCalledWith({
            wallet: expect.objectContaining({ id: standard.id }),
            contacts: undefined,
            toncenterApiKey: 'main-key',
            requiresSigning: undefined,
        });
    });

    it('uses external network overrides when config does not have a toncenter api key', async () => {
        const standard = createStandardWalletRecord({
            name: 'Primary wallet',
            network: 'mainnet',
            walletVersion: 'v5r1',
            address: mainAddress,
            mnemonic: 'abandon '.repeat(23) + 'about',
        });
        saveConfig({
            ...createEmptyConfig(),
            active_wallet_id: standard.id,
            wallets: [standard],
        });

        mocks.createMcpWalletServiceFromStoredWallet.mockResolvedValue({
            service: { getAddress: () => standard.address },
            close: vi.fn(),
        });

        const registry = new WalletRegistryService(undefined, {
            mainnet: { apiKey: 'override-key' },
        });
        const config = await registry.getNetworkConfig('mainnet');
        await registry.createWalletService();

        expect(config.toncenter_api_key).toBe('override-key');
        expect(mocks.createMcpWalletServiceFromStoredWallet).toHaveBeenCalledWith({
            wallet: expect.objectContaining({ id: standard.id }),
            contacts: undefined,
            toncenterApiKey: 'override-key',
            requiresSigning: undefined,
        });
    });

    it('rejects write-mode access for agentic wallets without operator key', async () => {
        const wallet = createAgenticWalletRecord({
            name: 'Read-only agent',
            network: 'mainnet',
            address: agentAddress,
            ownerAddress,
        });
        saveConfig({
            ...createEmptyConfig(),
            active_wallet_id: wallet.id,
            wallets: [wallet],
        });

        const registry = new WalletRegistryService();

        await expect(registry.createWalletService(undefined, { requiresSigning: true })).rejects.toThrow(
            /missing operator_private_key/i,
        );
        expect(mocks.createMcpWalletServiceFromStoredWallet).not.toHaveBeenCalled();
    });

    it('rejects write contexts for agentic wallets without operator key', async () => {
        const wallet = createAgenticWalletRecord({
            name: 'Read-only agent',
            network: 'mainnet',
            address: agentAddress,
            ownerAddress,
        });
        saveConfig({
            ...createEmptyConfig(),
            active_wallet_id: wallet.id,
            wallets: [wallet],
        });

        const registry = new WalletRegistryService();

        await expect(registry.createWalletService(undefined, { requiresSigning: true })).rejects.toThrow(
            /missing operator_private_key/i,
        );
        expect(mocks.createMcpWalletServiceFromStoredWallet).not.toHaveBeenCalled();
    });

    it('validates and imports an agentic wallet while recovering operator key from pending setup', async () => {
        const pending = createPendingAgenticDeployment({
            network: 'mainnet',
            operatorPrivateKey: '0xpending',
            operatorPublicKey: '0xbeef',
            name: 'Pending root agent',
            source: 'Started from MCP',
        });
        saveConfig({
            ...createEmptyConfig(),
            pending_agentic_deployments: [pending],
        });
        mocks.validateAgenticWalletAddress.mockResolvedValue({
            address: agentAddress,
            balanceNano: '42',
            balanceTon: '0.000000042',
            ownerAddress,
            operatorPublicKey: '0xbeef',
            originOperatorPublicKey: '0x1234',
            collectionAddress: ownerAddress,
            deployedByUser: true,
            name: 'On-chain agent',
        });

        const registry = new WalletRegistryService();
        const result = await registry.addAgentWallet({
            address: agentAddress,
            network: 'mainnet',
        });

        expect(result.recoveredPendingKeyDraft).toBe(true);
        expect(result.updatedExisting).toBe(false);
        expect(result.dashboardUrl).toBe(`https://dashboard.test/agent/${result.wallet.address}`);
        expect(result.wallet).toMatchObject({
            type: 'agentic',
            name: 'Pending root agent',
            operator_private_key: '0xpending',
            operator_public_key: '0xbeef',
            source: 'Started from MCP',
        });

        const stored = loadConfig();
        expect(stored?.active_wallet_id).toBe(result.wallet.id);
        expect(stored?.pending_agentic_deployments).toBeUndefined();
    });

    it('stores operator private key on an imported agentic wallet', async () => {
        const wallet = createAgenticWalletRecord({
            name: 'Agent wallet',
            network: 'mainnet',
            address: agentAddress,
            ownerAddress,
            operatorPublicKey: '0xbeef',
        });
        saveConfig({
            ...createEmptyConfig(),
            active_wallet_id: wallet.id,
            wallets: [wallet],
        });

        const registry = new WalletRegistryService();
        const updated = await registry.setAgenticOperatorPrivateKey({
            selector: wallet.id,
            privateKey: '0x1111',
        });

        expect(mocks.resolveOperatorCredentials).toHaveBeenCalledWith('0x1111', '0xbeef');
        expect(updated.operator_private_key).toBe('normalized:0x1111');
        expect(updated.operator_public_key).toBe('0xbeef');
        expect(loadConfig()?.wallets[0]).toEqual(expect.objectContaining({ operator_private_key: 'normalized:0x1111' }));
    });

    it('completes a pending root-agent setup and makes the imported wallet active', async () => {
        const pending = createPendingAgenticDeployment({
            network: 'mainnet',
            operatorPrivateKey: '0xpending',
            operatorPublicKey: '0xbeef',
            name: 'Pending agent',
            source: 'Pending source',
        });
        saveConfig({
            ...createEmptyConfig(),
            pending_agentic_deployments: [pending],
        });

        const registry = new WalletRegistryService();
        const wallet = await registry.completePendingAgenticSetup({
            setupId: pending.id,
            validatedWallet: {
                address: agentAddress,
                balanceNano: '100',
                balanceTon: '0.0000001',
                ownerAddress,
                operatorPublicKey: '0xbeef',
                originOperatorPublicKey: '0xfeed',
                collectionAddress: ownerAddress,
                deployedByUser: true,
                name: 'Validated agent',
            },
            name: 'Imported root agent',
            source: 'Completed from callback',
        });

        expect(wallet).toMatchObject({
            type: 'agentic',
            name: 'Imported root agent',
            operator_private_key: '0xpending',
            source: 'Completed from callback',
            deployed_by_user: true,
        });

        const stored = loadConfig();
        expect(stored?.active_wallet_id).toBe(wallet.id);
        expect(stored?.wallets).toEqual([expect.objectContaining({ id: wallet.id })]);
        expect(stored?.pending_agentic_deployments).toBeUndefined();
    });

    it('rejects pending root-agent completion when operator public key does not match the pending setup', async () => {
        const pending = createPendingAgenticDeployment({
            network: 'mainnet',
            operatorPrivateKey: '0xpending',
            operatorPublicKey: '0xbeef',
            name: 'Pending agent',
        });
        saveConfig({
            ...createEmptyConfig(),
            pending_agentic_deployments: [pending],
        });

        const registry = new WalletRegistryService();

        await expect(
            registry.completePendingAgenticSetup({
                setupId: pending.id,
                validatedWallet: {
                    address: agentAddress,
                    balanceNano: '100',
                    balanceTon: '0.0000001',
                    ownerAddress,
                    operatorPublicKey: '0xdead',
                    collectionAddress: ownerAddress,
                    deployedByUser: true,
                },
            }),
        ).rejects.toThrow(/pending operator key does not match/i);
    });

    it('rejects completion when the validated wallet operator key does not match the pending setup', async () => {
        const pending = createPendingAgenticDeployment({
            network: 'mainnet',
            operatorPrivateKey: '0xpending',
            operatorPublicKey: '0xbeef',
        });
        saveConfig({
            ...createEmptyConfig(),
            pending_agentic_deployments: [pending],
        });

        const registry = new WalletRegistryService();

        await expect(
            registry.completePendingAgenticSetup({
                setupId: pending.id,
                validatedWallet: {
                    address: agentAddress,
                    balanceNano: '100',
                    balanceTon: '0.0000001',
                    ownerAddress,
                    operatorPublicKey: '0xdead',
                    originOperatorPublicKey: '0xfeed',
                    collectionAddress: ownerAddress,
                    deployedByUser: true,
                },
            }),
        ).rejects.toThrow(/pending operator key does not match/i);
    });

    it('routes validation and owner lookup through the agentic client helpers', async () => {
        const expectedWallets = [
            {
                address: agentAddress,
                balanceNano: '1000',
                balanceTon: '0.000001',
                ownerAddress,
                operatorPublicKey: '0xbeef',
                collectionAddress: ownerAddress,
            },
        ];
        mocks.validateAgenticWalletAddress.mockResolvedValue(expectedWallets[0]);
        mocks.listAgenticWalletsByOwner.mockResolvedValue(expectedWallets);

        const registry = new WalletRegistryService();
        const validated = await registry.validateAgenticWallet({ address: agentAddress, network: 'testnet' });
        const listed = await registry.listAgenticWalletsByOwner({ ownerAddress, network: 'mainnet' });

        expect(validated.address).toBe(agentAddress);
        expect(listed).toEqual(expectedWallets);
        expect(mocks.createApiClient).toHaveBeenNthCalledWith(1, 'testnet', undefined);
        expect(mocks.createApiClient).toHaveBeenNthCalledWith(2, 'mainnet', undefined);
    });

    it('removes wallets and rotates the active wallet', async () => {
        const first = createStandardWalletRecord({
            name: 'Primary wallet',
            network: 'mainnet',
            walletVersion: 'v5r1',
            address: mainAddress,
        });
        const second = createAgenticWalletRecord({
            name: 'Agent wallet',
            network: 'mainnet',
            address: agentAddress,
            ownerAddress,
        });
        saveConfig({
            ...createEmptyConfig(),
            active_wallet_id: first.id,
            wallets: [first, second],
        });

        const registry = new WalletRegistryService();
        const result = await registry.removeWallet(first.id);

        expect(result.removed.id).toBe(first.id);
        expect(result.activeWalletId).toBe(second.id);
        expect(loadConfig()?.wallets.map((wallet: StoredWallet) => wallet.id)).toEqual([second.id]);
    });
});
