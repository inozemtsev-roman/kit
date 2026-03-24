/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { useCallback, useMemo } from 'react';
import type { FC, ReactNode, ComponentProps } from 'react';
import type { SendTransactionParameters, SendTransactionReturnType } from '@ton/appkit';

import { TransactionActionProvider, useTransactionActionContext } from '../transaction-provider';
import { useI18n } from '../../../../hooks/use-i18n';
import { Button } from '../../../../components/button';

export interface TransactionActionRenderProps {
    isLoading: boolean;
    onSubmit: () => void;
    disabled: boolean;
    text: ReactNode;
}

export type TransactionActionRequest =
    | SendTransactionParameters
    | Promise<SendTransactionParameters>
    | (() => SendTransactionParameters)
    | (() => Promise<SendTransactionParameters>);

export interface TransactionActionProps extends Omit<ComponentProps<'button'>, 'children' | 'onError'> {
    /** The transaction request parameters */
    request: TransactionActionRequest;
    /** Callback when an error occurs */
    onError?: (error: Error) => void;
    /** Callback when the transaction is successful */
    onSuccess?: (response: SendTransactionReturnType) => void;
    /** Custom button text */
    text?: ReactNode;
    /** Custom render function */
    children?: (props: TransactionActionRenderProps) => ReactNode;
}

interface TransactionActionContentProps extends Omit<ComponentProps<'button'>, 'children'> {
    text?: ReactNode;
    children?: (props: TransactionActionRenderProps) => ReactNode;
}

const TransactionActionContent: FC<TransactionActionContentProps> = ({ text, children, ...props }) => {
    const { isLoading, onSubmit, disabled } = useTransactionActionContext();
    const { t } = useI18n();

    const isDisabled = disabled || isLoading;

    const handleSubmit = useCallback(() => {
        if (!isDisabled) {
            onSubmit();
        }
    }, [isDisabled, onSubmit]);

    const buttonText = useMemo(() => {
        if (isLoading) {
            return t('transaction.processing');
        }

        return text ?? t('transaction.sendTransaction');
    }, [isLoading, text, t]);

    if (children) {
        return (
            <>
                {children({
                    isLoading,
                    onSubmit: handleSubmit,
                    disabled: isDisabled,
                    text: buttonText,
                })}
            </>
        );
    }

    return (
        <Button onClick={handleSubmit} disabled={isDisabled} {...props}>
            {buttonText}
        </Button>
    );
};

export const TransactionAction: FC<TransactionActionProps> = ({
    request,
    children,
    className,
    onError,
    onSuccess,
    disabled = false,
    text,
    ...props
}) => {
    return (
        <TransactionActionProvider request={request} onError={onError} onSuccess={onSuccess} disabled={disabled}>
            <TransactionActionContent className={className} text={text} {...props}>
                {children}
            </TransactionActionContent>
        </TransactionActionProvider>
    );
};
