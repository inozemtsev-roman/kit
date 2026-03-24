/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useWatchBalance, useWatchTransactions, useWatchJettons } from '@ton/appkit-react';
import { toast } from 'sonner';

import { MinterPage } from '@/pages';

export const AppRouter: React.FC = () => {
    // Enable global real-time balance updates
    useWatchBalance();
    useWatchJettons();

    // Enable real-time transaction notifications
    useWatchTransactions({
        onChange: (update) => {
            if (update.traceHash) {
                const hash = update.traceHash;
                const shortHash = `${hash.slice(0, 6)}...${hash.slice(-4)}`;

                if (update.finality === 'finalized') {
                    toast.success(`Transaction ${shortHash} finalized`, {
                        id: hash,
                    });
                } else {
                    const message =
                        update.finality === 'confirmed'
                            ? `Transaction ${shortHash} confirmed`
                            : `Transaction ${shortHash} pending...`;

                    toast.loading(message, {
                        id: hash,
                    });
                }
            }
        },
    });

    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<MinterPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    );
};
