/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { describe, expect, it } from 'vitest';

import {
    AgenticWalletValidationError,
    buildAgenticCreateDeepLink,
    buildAgenticDashboardLink,
    preflightValidateAgenticWalletAddress,
} from '../utils/agentic.js';

describe('mcp agentic helpers', () => {
    it('builds create deeplinks for dashboard flow', () => {
        const url = new URL(
            buildAgenticCreateDeepLink({
                operatorPublicKey: '0x1234',
                callbackUrl: 'http://127.0.0.1:4567/agentic/callback/setup-1',
                agentName: 'Alpha',
                source: 'mcp',
                tonDeposit: '0.2',
            }),
        );

        expect(url.origin + '/').toBe('https://agentic-wallets-dashboard.vercel.app/');
        expect(url.pathname).toBe('/create');
        expect(url.searchParams.get('operatorPublicKey')).toBe('0x1234');
        expect(url.searchParams.get('callbackUrl')).toBe('http://127.0.0.1:4567/agentic/callback/setup-1');
        expect(url.searchParams.get('agentName')).toBe('Alpha');
        expect(url.searchParams.get('source')).toBe('mcp');
        expect(url.searchParams.get('tonDeposit')).toBe('0.2');
    });

    it('builds dashboard links', () => {
        const url = new URL(buildAgenticDashboardLink('kQAgent'));
        expect(url.origin + '/').toBe('https://agentic-wallets-dashboard.vercel.app/');
        expect(url.pathname).toBe('/agent/kQAgent');
    });

    it('fails preflight for a non-agentic active contract before storage parsing', async () => {
        const client = {
            getAccountState: async () => ({
                status: 'active',
                balance: '0',
                extraCurrencies: {},
                code: 'te6ccgEBAQEAAgAAAA==',
                data: 'te6ccgEBAQEAAgAAAA==',
                lastTransaction: null,
            }),
        } as never;

        await expect(
            preflightValidateAgenticWalletAddress({
                client,
                address: 'EQNotAgentic',
                network: 'mainnet',
            }),
        ).rejects.toThrow(/not an agentic wallet contract/i);
    });

    it('classifies inactive addresses as invalid agentic wallets in preflight', async () => {
        const client = {
            getAccountState: async () => ({
                status: 'uninitialized',
                balance: '0',
                extraCurrencies: {},
                code: null,
                data: null,
                lastTransaction: null,
            }),
        } as never;

        await expect(
            preflightValidateAgenticWalletAddress({
                client,
                address: 'EQInactive',
                network: 'testnet',
            }),
        ).rejects.toBeInstanceOf(AgenticWalletValidationError);
        await expect(
            preflightValidateAgenticWalletAddress({
                client,
                address: 'EQInactive',
                network: 'testnet',
            }),
        ).rejects.toThrow(/not an active agentic wallet contract/i);
    });
});
