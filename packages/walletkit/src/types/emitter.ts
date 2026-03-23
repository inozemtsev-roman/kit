/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type { TransactionEmulatedTrace } from '../api/models';
import type { RawBridgeEventRestoreConnection, RawBridgeEventTransaction } from './internal';
import type { EventEmitter } from '../core/EventEmitter';
import type { StreamingEvents } from '../api/models';

/**
 * Definition of all events emitted by the TonWalletKit.
 */
export type WalletKitEvents = {
    restoreConnection: RawBridgeEventRestoreConnection;
    eventError: RawBridgeEventTransaction;
    emulationResult: TransactionEmulatedTrace;
    bridgeStorageUpdated: object;
} & StreamingEvents;

export type WalletKitEventEmitter = EventEmitter<WalletKitEvents>;
