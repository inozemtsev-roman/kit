/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type { StreamingProviderFactory } from './StreamingProvider';
import type {
    Network,
    BalanceUpdate,
    TransactionsUpdate,
    JettonUpdate,
    StreamingUpdate,
    StreamingWatchType,
} from '../models';

export interface StreamingAPI {
    /**
     * Register a provider factory for a specific network.
     */
    registerProvider(network: Network, factory: StreamingProviderFactory): void;

    /**
     * Watch account balance changes.
     */
    watchBalance(network: Network, address: string, onChange: (update: BalanceUpdate) => void): () => void;

    /**
     * Watch transactions for an address.
     */
    watchTransactions(network: Network, address: string, onChange: (update: TransactionsUpdate) => void): () => void;

    /**
     * Watch jetton changes for an address.
     */
    watchJettons(network: Network, address: string, onChange: (jetton: JettonUpdate) => void): () => void;

    /**
     * Bulk watch multiple types for an address.
     */
    watch(
        network: Network,
        address: string,
        types: Exclude<StreamingWatchType, 'trace'>[],
        onUpdate: (type: StreamingWatchType, update: StreamingUpdate) => void,
    ): () => void;

    /**
     * Close all active streaming connections.
     */
    shutdown(): void;
}
