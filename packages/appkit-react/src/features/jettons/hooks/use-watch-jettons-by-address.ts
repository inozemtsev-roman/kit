/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Address } from '@ton/core';
import { watchJettonsByAddress, hasStreamingProvider, resolveNetwork, sleep, compareAddress } from '@ton/appkit';
import type { WatchJettonsByAddressOptions, JettonUpdate } from '@ton/appkit';
import { formatUnits } from '@ton/appkit';
import type { GetJettonsByAddressData } from '@ton/appkit/queries';
import { getJettonsByAddressQueryKey, getJettonBalanceByAddressQueryKey } from '@ton/appkit/queries';

import { useAppKit } from '../../../hooks/use-app-kit';

export type UseWatchJettonsByAddressParameters = Partial<WatchJettonsByAddressOptions>;

/**
 * Hook to watch jetton updates for a specific address in real-time.
 * Automatically updates TanStack Query caches for jetton balances.
 */
export const useWatchJettonsByAddress = (parameters: UseWatchJettonsByAddressParameters): void => {
    const { address, network } = parameters;
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

        const addressString = Address.isAddress(address) ? address.toString() : address;

        return watchJettonsByAddress(appKit, {
            ...parameters,
            address,
            network: resolvedNetwork,
            onChange: (update: JettonUpdate) => {
                parameters.onChange?.(update);

                if (update.finality === 'finalized') {
                    // Invalidate jettons list cache
                    const jettonsListKey = getJettonsByAddressQueryKey({
                        address: addressString,
                        network: resolvedNetwork,
                    });
                    const currentJettonsList = queryClient.getQueryData(jettonsListKey) as GetJettonsByAddressData;
                    if (currentJettonsList?.jettons) {
                        const jetton = currentJettonsList.jettons.find((j) =>
                            compareAddress(j.address, update.masterAddress),
                        );
                        const decimals = jetton?.decimalsNumber ?? update.decimals;

                        if (jetton && decimals) {
                            const updatedJetton = {
                                ...jetton,
                                balance: formatUnits(update.balance, decimals),
                            };
                            const newJettonsList = currentJettonsList.jettons.map((j) =>
                                compareAddress(j.address, update.masterAddress) ? updatedJetton : j,
                            );
                            queryClient.setQueryData(jettonsListKey, {
                                ...currentJettonsList,
                                jettons: newJettonsList,
                            });
                        }
                    }
                    sleep(5000).then(() => queryClient.invalidateQueries({ queryKey: jettonsListKey }));

                    // Invalidate jetton balance cache
                    const jettonBalanceKey = getJettonBalanceByAddressQueryKey({
                        ownerAddress: addressString,
                        jettonAddress: update.masterAddress,
                        network: resolvedNetwork,
                    });
                    queryClient.setQueryData(jettonBalanceKey, update.balance);
                    sleep(5000).then(() => queryClient.invalidateQueries({ queryKey: jettonsListKey }));
                }
            },
        });
    }, [address, network, appKit, queryClient, parameters]);
};
