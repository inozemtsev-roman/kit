/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type {
    TonCenterStreamingProviderConfig,
    TonApiStreamingProviderConfig,
    StreamingProvider,
    StreamingWatchType,
    StreamingUpdate,
} from '@ton/walletkit';

import { TonCenterStreamingProvider, TonApiStreamingProvider } from '@ton/walletkit';

import { getKit } from '../utils/bridge';
import { emit } from '../transport/messaging';
import { retain, get, release } from '../utils/registry';

export async function createTonCenterStreamingProvider(args: { config: TonCenterStreamingProviderConfig }) {
    const instance = await getKit();
    const ctx = (instance as any).createFactoryContext();
    const provider = new TonCenterStreamingProvider(ctx, args.config);
    const providerId = retain('streamingProvider', provider);
    return { providerId };
}

export async function createTonApiStreamingProvider(args: { config: TonApiStreamingProviderConfig }) {
    const instance = await getKit();
    const ctx = (instance as any).createFactoryContext();
    const provider = new TonApiStreamingProvider(ctx, args.config);
    const providerId = retain('streamingProvider', provider);
    return { providerId };
}

export async function registerStreamingProvider(args: { providerId: string }) {
    const instance = await getKit();
    const provider = get<StreamingProvider>(args.providerId);
    if (!provider) throw new Error(`Streaming provider not found: ${args.providerId}`);
    (instance as any).streaming.registerProvider(() => provider);
}

export async function streamingHasProvider(args: { network: { chainId: string } }) {
    const instance = await getKit();
    return { hasProvider: (instance as any).streaming.hasProvider(args.network) as boolean };
}

export async function streamingWatch(args: { network: { chainId: string }; address: string; types: StreamingWatchType[] }) {
    const instance = await getKit();
    let subscriptionId: string;
    const unwatch = (instance as any).streaming.watch(
        args.network,
        args.address,
        args.types,
        (_type: StreamingWatchType, update: StreamingUpdate) => {
            emit('streamingUpdate', { subscriptionId, update });
        },
    );
    subscriptionId = retain('streamingSub', unwatch);
    return { subscriptionId };
}

export async function streamingUnwatch(args: { subscriptionId: string }) {
    const unwatch = get<() => void>(args.subscriptionId);
    if (unwatch) {
        unwatch();
        release(args.subscriptionId);
    }
}

export async function streamingConnect() {
    const instance = await getKit();
    (instance as any).streaming.connect();
}

export async function streamingDisconnect() {
    const instance = await getKit();
    (instance as any).streaming.disconnect();
}

export async function streamingWatchConnectionChange(args: { network: { chainId: string } }) {
    const instance = await getKit();
    let subscriptionId: string;
    const unwatch = (instance as any).streaming.onConnectionChange(args.network, (connected: boolean) => {
        emit('streamingConnectionChange', { subscriptionId, connected });
    });
    subscriptionId = retain('streamingSub', unwatch);
    return { subscriptionId };
}
