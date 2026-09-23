/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import type { RenderModalProps } from "@vencord/discord-types";
import { ConfirmModal, Modal, openModal } from "@webpack/common";

import { clear, markAllRead } from "../store";
import { cl } from "../utils";
import { InboxBody, useInboxState } from "./InboxBody";

const PAGE_SIZE = 50;

export function openInbox(): void {
    openModal(props => <InboxModal modalProps={props} />);
}

function confirmClear() {
    openModal(props => (
        <ConfirmModal
            {...props}
            title="Clear all hits?"
            subtitle="Every captured hit is deleted. Your rules are kept."
            confirmText="Clear all"
            cancelText="Cancel"
            onConfirm={() => { clear(); }}
        />
    ));
}

export function InboxModal({ modalProps }: { modalProps: RenderModalProps; }) {
    const state = useInboxState(PAGE_SIZE);
    const { hits, unread, filter, isFiltered } = state;

    return (
        <Modal
            {...modalProps}
            size="lg"
            title="Message Subscriptions"
            subtitle={`${hits.length} hits · ${unread} unread`}
            actions={[
                {
                    text: "Mark all read",
                    variant: "secondary",
                    onClick: () => markAllRead(filter.ruleId),
                    disabled: unread === 0
                },
                {
                    text: "Clear all",
                    variant: "critical-primary",
                    onClick: confirmClear,
                    disabled: hits.length === 0 && !isFiltered
                },
                {
                    text: "Close",
                    variant: "primary",
                    onClick: () => modalProps.onClose()
                }
            ]}
        >
            <ErrorBoundary>
                <div className={cl("modal")}>
                    <InboxBody variant="modal" state={state} />
                </div>
            </ErrorBoundary>
        </Modal>
    );
}
