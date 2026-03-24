/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type { Network } from '../api/models';
import type { StreamingProvider, StreamingProviderFactory, StreamingAPI } from '../api/interfaces';
import type {
    JettonUpdate,
    BalanceUpdate,
    TransactionsUpdate,
    StreamingUpdate,
    StreamingWatchType,
    StreamingEvents,
} from '../api/models';
import { globalLogger } from '../core/Logger';
import { asAddressFriendly, compareAddress } from '../utils';
import type { EventEmitter } from '../core/EventEmitter';

const log = globalLogger.createChild('StreamingManager');

/**
 * Orchestrates streaming providers and synchronizes them with the global EventEmitter.
 */
export class StreamingManager<E extends StreamingEvents = StreamingEvents> implements StreamingAPI {
    private providers: Map<string, StreamingProvider> = new Map();
    private watchCounts: Map<string, Map<string, number>> = new Map(); // network -> address -> count
    private providerFactories: Map<string, StreamingProviderFactory> = new Map();

    constructor(private eventEmitter: EventEmitter<E>) {}

    /**
     * Register a provider factory for a specific network.
     */
    registerProvider(network: Network, factory: StreamingProviderFactory): void {
        const networkId = String(network.chainId);

        if (this.providerFactories.has(networkId)) {
            log.warn(`Provider factory for network ${networkId} is already registered. Overriding with new factory.`);
        }

        this.providerFactories.set(networkId, factory);
    }

    /**
     * Check if a provider factory is registered for a specific network.
     */
    hasProvider(network: Network): boolean {
        return this.providerFactories.has(String(network.chainId));
    }

    /**
     * Watch account balance changes.
     */
    watchBalance(network: Network, address: string, onChange: (update: BalanceUpdate) => void): () => void {
        const id = asAddressFriendly(address);
        const unwatchProvider = this.addWatcher(network, 'balance', id);
        const off = this.eventEmitter.on('streaming:balance-update', ({ payload: update }) => {
            if (compareAddress(address, update.address)) onChange(update);
        });

        return () => {
            unwatchProvider();
            off();
        };
    }

    /**
     * Watch transactions for an address.
     */
    watchTransactions(network: Network, address: string, onChange: (update: TransactionsUpdate) => void): () => void {
        const id = asAddressFriendly(address);
        const unwatchProvider = this.addWatcher(network, 'transactions', id);
        const off = this.eventEmitter.on('streaming:transactions', ({ payload: update }) => {
            if (compareAddress(address, update.address)) onChange(update);
        });

        return () => {
            unwatchProvider();
            off();
        };
    }

    /**
     * Watch jetton changes for an address.
     */
    watchJettons(network: Network, address: string, onChange: (jetton: JettonUpdate) => void): () => void {
        const id = asAddressFriendly(address);
        const unwatchProvider = this.addWatcher(network, 'jettons', id);
        const off = this.eventEmitter.on('streaming:jettons-update', ({ payload: jetton }) => {
            if (compareAddress(address, jetton.ownerAddress)) onChange(jetton);
        });

        return () => {
            unwatchProvider();
            off();
        };
    }

    /**
     * Bulk watch multiple types for an address.
     */
    watch(
        network: Network,
        address: string,
        types: Exclude<StreamingWatchType, 'trace'>[],
        onUpdate: (type: StreamingWatchType, update: StreamingUpdate) => void,
    ): () => void {
        const unwatchers = types.map((type) => {
            switch (type) {
                case 'balance':
                    return this.watchBalance(network, address, (u) => onUpdate('balance', u));
                case 'transactions':
                    return this.watchTransactions(network, address, (u) => onUpdate('transactions', u));
                case 'jettons':
                    return this.watchJettons(network, address, (u) => onUpdate('jettons', u));
                default:
                    return () => {};
            }
        });

        return () => unwatchers.forEach((unwatch) => unwatch());
    }

    private addWatcher(network: Network, type: StreamingWatchType, id: string): () => void {
        const networkId = String(network.chainId);
        const resourceKey = `${type}:${id}`;

        let networkWatch = this.watchCounts.get(networkId);
        if (!networkWatch) {
            networkWatch = new Map();
            this.watchCounts.set(networkId, networkWatch);
        }

        const currentCount = networkWatch.get(resourceKey) || 0;
        networkWatch.set(resourceKey, currentCount + 1);

        const provider = this.getProvider(network);
        if (currentCount === 0) {
            this.callProviderWatch(provider, type, id);
        }

        const networkWatchSnapshot = networkWatch;
        return () => {
            const count = networkWatchSnapshot.get(resourceKey) || 0;
            if (count <= 1) {
                networkWatchSnapshot.delete(resourceKey);
                this.callProviderUnwatch(provider, type, id);
            } else {
                networkWatchSnapshot.set(resourceKey, count - 1);
            }
        };
    }

    private callProviderWatch(provider: StreamingProvider, type: StreamingWatchType, id: string): void {
        switch (type) {
            case 'balance':
                provider.watchBalance(id);
                break;
            case 'transactions':
                provider.watchTransactions(id);
                break;
            case 'jettons':
                provider.watchJettons(id);
                break;
        }
    }

    private callProviderUnwatch(provider: StreamingProvider, type: StreamingWatchType, id: string): void {
        switch (type) {
            case 'balance':
                provider.unwatchBalance(id);
                break;
            case 'transactions':
                provider.unwatchTransactions(id);
                break;
            case 'jettons':
                provider.unwatchJettons(id);
                break;
        }
    }

    private getProvider(network: Network): StreamingProvider {
        const networkId = String(network.chainId);
        let provider = this.providers.get(networkId);
        if (provider) return provider;

        const factory = this.providerFactories.get(networkId);
        if (!factory) {
            throw new Error(`No streaming provider factory registered for network ${networkId}`);
        }

        log.info('Creating new streaming provider', { networkId });

        provider = factory({
            network,
            getWatchers: () => this.getWatchers(network),
            listener: {
                onBalanceUpdate: (update) =>
                    this.eventEmitter.emit(
                        'streaming:balance-update',
                        update as E['streaming:balance-update'],
                        'streaming-manager',
                    ),
                onTransactions: (update) =>
                    this.eventEmitter.emit(
                        'streaming:transactions',
                        update as E['streaming:transactions'],
                        'streaming-manager',
                    ),
                onJettonsUpdate: (update) =>
                    this.eventEmitter.emit(
                        'streaming:jettons-update',
                        update as E['streaming:jettons-update'],
                        'streaming-manager',
                    ),
            },
        });

        this.providers.set(networkId, provider);
        return provider;
    }

    private getWatchers(network: Network): Map<StreamingWatchType, Set<string>> {
        const networkId = String(network.chainId);
        const networkWatch = this.watchCounts.get(networkId);
        const result = new Map<StreamingWatchType, Set<string>>();

        if (!networkWatch) return result;

        networkWatch.forEach((count, key) => {
            if (count > 0) {
                const [type, id] = key.split(':') as [StreamingWatchType, string];
                let set = result.get(type);
                if (!set) {
                    set = new Set();
                    result.set(type, set);
                }
                set.add(id);
            }
        });

        return result;
    }

    /**
     * Close all active streaming connections.
     */
    shutdown(): void {
        this.providers.forEach((provider) => provider.close());
        this.providers.clear();
        this.watchCounts.clear();
    }
}
