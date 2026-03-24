/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { watchBalanceByAddress, hasStreamingProvider, resolveNetwork, sleep } from '@ton/appkit';
import type { WatchBalanceByAddressOptions } from '@ton/appkit';
import { getBalanceByAddressQueryKey } from '@ton/appkit/queries';

import { useAppKit } from '../../../hooks/use-app-kit';

export type UseWatchBalanceByAddressParameters = Partial<WatchBalanceByAddressOptions>;

/**
 * Hook to watch balance of a specific address in real-time.
 * Automatically updates the TanStack Query cache for `useBalanceByAddress`.
 */
export const useWatchBalanceByAddress = (parameters: UseWatchBalanceByAddressParameters): void => {
    const { address, network, onChange } = parameters;
    const appKit = useAppKit();
    const queryClient = useQueryClient();

    useEffect(() => {
        if (!address) return;

        const resolvedNetwork = resolveNetwork(appKit, network);
        if (!resolvedNetwork || !hasStreamingProvider(appKit, resolvedNetwork)) {
            // eslint-disable-next-line no-console
            console.warn(
                resolvedNetwork
                    ? `No streaming provider available for network: ${resolvedNetwork?.chainId}`
                    : 'No network provided',
            );

            return;
        }

        const queryKey = getBalanceByAddressQueryKey({ address, network: resolvedNetwork });

        return watchBalanceByAddress(appKit, {
            address,
            network: resolvedNetwork,
            onChange: (balance) => {
                onChange?.(balance);

                if (balance.finality === 'finalized') {
                    queryClient.setQueryData(queryKey, balance.balance);
                    sleep(5000).then(() => queryClient.invalidateQueries({ queryKey: queryKey }));
                }
            },
        });
    }, [address, network, appKit, queryClient, onChange]);
};
