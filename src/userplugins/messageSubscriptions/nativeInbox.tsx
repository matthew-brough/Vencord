/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { useForceUpdater } from "@utils/react";
import { TabBar, useEffect } from "@webpack/common";
import type { ComponentType, PropsWithChildren, ReactNode } from "react";

import { InboxPanel } from "./components/InboxPanel";
import { settings } from "./settings";
import { useUnreadCount } from "./store";
import { logger } from "./utils";

export const TAB_ID = "vc-msgsubs";

interface TabItemProps {
    id: string;
}

interface PanelProps {
    closePopout(): void;
}

let active = false;
const listeners = new Set<() => void>();

function setActive(next: boolean) {
    if (active === next) return;

    active = next;
    for (const listener of listeners) listener();
}

function useActiveFlag(): boolean {
    const forceUpdate = useForceUpdater();

    useEffect(() => {
        listeners.add(forceUpdate);
        return () => void listeners.delete(forceUpdate);
    }, [forceUpdate]);

    return active;
}

export function shouldRender(): boolean {
    return settings.store.nativeInboxTab;
}

/** Render scope only — subscribes the patched component to our tab state. */
export function isActive(): boolean {
    const activeNow = useActiveFlag();
    const { nativeInboxTab } = settings.use(["nativeInboxTab"]);

    return activeNow && nativeInboxTab;
}

/** Render scope only — see {@link isActive}. */
export function selectedItem<T>(tab: T): T | typeof TAB_ID {
    return isActive() ? TAB_ID : tab;
}

export function wrapSelect<T>(setTab: (id: T) => void): (id: T | typeof TAB_ID) => void {
    return id => {
        if (id === TAB_ID && shouldRender()) {
            setActive(true);
            return;
        }

        setActive(false);
        setTab(id as T);
    };
}

const TabLabel = ErrorBoundary.wrap(() => {
    const { nativeTabLabel } = settings.use(["nativeTabLabel"]);
    const unread = useUnreadCount();
    const label = nativeTabLabel || "Subs";

    return <>{unread > 0 ? `${label} (${unread})` : label}</>;
}, { noop: true });

const Panel = ErrorBoundary.wrap(({ closePopout }: PanelProps) => (
    <InboxPanel closePopout={closePopout} />
), { noop: true });

export function renderTabItem(): ReactNode {
    try {
        if (!shouldRender()) return null;

        // TabBar is a lazy wrapper — .Item only exists once webpack resolved it, so never hoist this
        const TabBarItem = TabBar.Item as ComponentType<PropsWithChildren<TabItemProps>> | undefined;
        if (!TabBarItem) return null;

        // must be a real TabBar.Item element: TabBar clones its children to inject selection and onClick
        return (
            <TabBarItem key={TAB_ID} id={TAB_ID}>
                <TabLabel />
            </TabBarItem>
        );
    } catch (e) {
        logger.error("Failed to render the inbox tab item", e);
        return null;
    }
}

export function renderPanel(props: PanelProps): ReactNode {
    return <Panel {...props} />;
}
