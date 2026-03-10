/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { ApiClientToncenter, Network } from '@ton/walletkit';
import type { ApiClient, ApiClientConfig } from '@ton/walletkit';

import type { TonNetwork } from '../registry/config.js';

export function buildApiClientConfig(
    network: TonNetwork,
    apiKey?: string,
): ApiClientConfig & { minRequestIntervalMs?: number } {
    const toncenterUrl = network === 'mainnet' ? 'https://toncenter.com' : 'https://testnet.toncenter.com';

    return apiKey
        ? {
              url: toncenterUrl,
              key: apiKey,
              minRequestIntervalMs: 0,
          }
        : {
              minRequestIntervalMs: 1000,
          };
}

export function createApiClient(network: TonNetwork, apiKey?: string): ApiClient {
    const resolvedNetwork = network === 'mainnet' ? Network.mainnet() : Network.testnet();

    return new ApiClientToncenter({
        ...buildApiClientConfig(network, apiKey),
        network: resolvedNetwork,
        apiKey,
    });
}
