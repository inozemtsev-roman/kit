/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { watchBalanceByAddress, hasStreamingProvider } from '@ton/appkit';
import { useAddress, useAppKit, useBalance, useNetwork } from '@ton/appkit-react';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { MinterPage } from '@/pages';

export const AppRouter: React.FC = () => {
    const address = useAddress();
    const network = useNetwork();
    const queryClient = useQueryClient();
    const appKit = useAppKit();
    const { queryKey } = useBalance();

    useEffect(() => {
        if (!address || !network || !hasStreamingProvider(appKit, network)) return;

        return watchBalanceByAddress(appKit, {
            address,
            network,
            onChange: (balance) => queryClient.setQueryData(queryKey, balance),
        });
    }, [address, network, queryKey]);

    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<MinterPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    );
};
