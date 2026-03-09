/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import React, { useEffect, useRef, useState } from 'react';

const DURATION_MS = 500;

/** Ease-out cubic for smooth deceleration at the end */
function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
}

interface AnimatedBalanceProps {
    /** Balance in nanotons */
    balance: string | null | undefined;
    suffix?: string;
    className?: string;
}

export const AnimatedBalance: React.FC<AnimatedBalanceProps> = ({ balance, suffix = ' TON', className }) => {
    const targetValue = parseFloat(balance || '0') / 1e9;
    const displayRef = useRef(targetValue);
    const [displayValue, setDisplayValue] = useState(targetValue);
    const rafRef = useRef<number | null>(null);

    useEffect(() => {
        const startValue = displayRef.current;
        const endValue = targetValue;

        if (startValue === endValue) return;

        const startTime = performance.now();

        const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / DURATION_MS, 1);
            const eased = easeOutCubic(progress);
            const current = startValue + (endValue - startValue) * eased;
            displayRef.current = current;
            setDisplayValue(current);
            if (progress < 1) {
                rafRef.current = requestAnimationFrame(animate);
            } else {
                displayRef.current = endValue;
            }
        };

        rafRef.current = requestAnimationFrame(animate);
        return () => {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
            }
        };
    }, [targetValue]);

    const formatted = displayValue.toFixed(4);
    return (
        <span className={className}>
            {formatted}
            {suffix}
        </span>
    );
};
