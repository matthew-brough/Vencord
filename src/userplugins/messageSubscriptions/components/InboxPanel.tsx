/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import type { JSX } from "react";

import { markAllRead } from "../store";
import { cl } from "../utils";
import { InboxBody, useInboxState } from "./InboxBody";
import { openInbox } from "./InboxModal";

const PAGE_SIZE = 25;

export function InboxPanel({ closePopout }: { closePopout(): void; }): JSX.Element {
    const state = useInboxState(PAGE_SIZE);
    const { unread, filter } = state;

    return (
        <div className={cl("panel")}>
            <div className={cl("panel-scroller")}>
                <InboxBody variant="panel" state={state} onNavigate={closePopout} />
            </div>

            <div className={cl("panel-footer")}>
                <Button
                    size="small"
                    variant="secondary"
                    disabled={unread === 0}
                    onClick={() => markAllRead(filter.ruleId)}
                >
                    Mark all read
                </Button>

                <Button
                    size="small"
                    onClick={() => {
                        closePopout();
                        openInbox();
                    }}
                >
                    Open full inbox ↗
                </Button>
            </div>
        </div>
    );
}
