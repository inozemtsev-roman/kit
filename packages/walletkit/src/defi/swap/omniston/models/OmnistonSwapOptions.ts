/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type { SettlementMethod as StonFiSettlementMethod } from '@ston-fi/omniston-sdk';

const _SETTLEMENT_METHOD_SWAP = 'SETTLEMENT_METHOD_SWAP';
const _SETTLEMENT_METHOD_ESCROW = 'SETTLEMENT_METHOD_ESCROW';
const _SETTLEMENT_METHOD_HTLC = 'SETTLEMENT_METHOD_HTLC';
const _UNRECOGNIZED = 'UNRECOGNIZED';

type SettlementMethod =
    | typeof _SETTLEMENT_METHOD_SWAP
    | typeof _SETTLEMENT_METHOD_ESCROW
    | typeof _SETTLEMENT_METHOD_HTLC
    | typeof _UNRECOGNIZED;

type SettlementMethodLiteralsBySdkKey = {
    [StonFiSettlementMethod.SETTLEMENT_METHOD_SWAP]: typeof _SETTLEMENT_METHOD_SWAP;
    [StonFiSettlementMethod.SETTLEMENT_METHOD_ESCROW]: typeof _SETTLEMENT_METHOD_ESCROW;
    [StonFiSettlementMethod.SETTLEMENT_METHOD_HTLC]: typeof _SETTLEMENT_METHOD_HTLC;
    [StonFiSettlementMethod.UNRECOGNIZED]: typeof _UNRECOGNIZED;
};

type SdkSettlementMethodRecord = Record<StonFiSettlementMethod, StonFiSettlementMethod>;
// On SDK drift, `SdkSettlementMethodLiteralsCheck` is `never` and the next line errors
type SdkSettlementMethodLiteralsCheck = SettlementMethodLiteralsBySdkKey extends SdkSettlementMethodRecord
    ? true
    : never;
const _settlementMethodLiteralsMatchSdk: SdkSettlementMethodLiteralsCheck = true;

export type OmnistonSwapOptions = {
    /**
     * Settlement methods to use for the swap
     */
    settlementMethods?: SettlementMethod[];
};
