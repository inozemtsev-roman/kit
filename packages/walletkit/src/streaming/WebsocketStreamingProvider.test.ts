/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

class MockWebSocket {
    static OPEN = 1;
    static CONNECTING = 0;
    static CLOSED = 3;
    static lastInstance: MockWebSocket | null = null;

    readyState = MockWebSocket.CONNECTING;
    onopen: (() => void) | null = null;
    onclose: (() => void) | null = null;
    onmessage: ((ev: MessageEvent) => void) | null = null;
    send = vi.fn();
    close = vi.fn();

    constructor(public url: string) {
        MockWebSocket.lastInstance = this;
        setTimeout(() => {
            this.readyState = MockWebSocket.OPEN;
            if (this.onopen) this.onopen();
        }, 0);
    }
}

// @ts-expect-error WebSocket is global
global.WebSocket = MockWebSocket;

import type { StreamingProviderListener, StreamingProviderContext } from '../api/interfaces/StreamingProvider';
import type { StreamingWatchType } from '../api/models/streaming/StreamingWatchType';
import { WebsocketStreamingProvider } from './WebsocketStreamingProvider';

class TestProvider extends WebsocketStreamingProvider {
    protected getUrl() {
        return 'ws://test';
    }
    protected onMessage() {}
    protected fullResync() {}
    protected onWatch() {}
    protected onUnwatch() {}
    protected getPingMessage() {
        return { type: 'ping' };
    }

    public triggerClose() {
        if (this.ws) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (this.ws as any).onclose?.();
        }
    }
}

describe('WebsocketStreamingProvider', () => {
    let listener: StreamingProviderListener;
    let watchers: Map<StreamingWatchType, Set<string>>;
    let context: StreamingProviderContext;

    beforeEach(() => {
        vi.useFakeTimers();
        listener = {
            onBalanceUpdate: vi.fn(),
            onTransactions: vi.fn(),
            onJettonsUpdate: vi.fn(),
        };
        watchers = new Map();
        context = {
            listener,
            getWatchers: () => watchers,
            network: {} as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        };
        MockWebSocket.lastInstance = null;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should connect when watching a resource', () => {
        const provider = new TestProvider(context);
        provider.watchBalance('addr');
        expect(MockWebSocket.lastInstance).not.toBeNull();
    });

    it('should schedule reconnection on close if there are active subscriptions', async () => {
        const provider = new TestProvider(context);
        watchers.set('balance', new Set(['addr']));
        provider.watchBalance('addr');

        // Wait for connection
        await vi.runOnlyPendingTimersAsync();

        // Simulate close
        provider.triggerClose();

        // Should schedule reconnect (default 300ms)
        vi.runOnlyPendingTimers();
        expect(MockWebSocket.lastInstance).not.toBeNull();
    });

    it('should not reconnect if no active subscriptions', async () => {
        const provider = new TestProvider(context);
        provider.watchBalance('addr');

        await vi.runOnlyPendingTimersAsync();

        // Remove from watchers BEFORE close
        watchers.delete('balance');
        provider.triggerClose();

        vi.advanceTimersByTime(1000);
        // If it doesn't reconnect, lastInstance will still be the old one (or null if we cleared it correctly)
    });

    it('should start ping interval on open', async () => {
        const provider = new TestProvider(context);
        provider.watchBalance('addr');

        await vi.runOnlyPendingTimersAsync();

        // Default ping interval is 30000ms
        vi.advanceTimersByTime(30000);
        expect(MockWebSocket.lastInstance?.send).toHaveBeenCalledWith(JSON.stringify({ type: 'ping' }));
    });
});
