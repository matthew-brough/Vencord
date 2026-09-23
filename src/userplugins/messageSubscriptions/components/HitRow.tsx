/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import type { Channel, Message } from "@vencord/discord-types";
import { findComponentByCodeLazy } from "@webpack";
import { ChannelStore, Parser, Timestamp, useCallback, useState } from "@webpack/common";
import type { JSX, MouseEvent, ReactNode } from "react";

import { fetchMessage, peek } from "../messageCache";
import { settings } from "../settings";
import { markRead, remove } from "../store";
import type { Hit } from "../types";
import { cl, jump, logger } from "../utils";

interface ChannelMessageProps {
    id: string;
    message: Message;
    channel: Channel;
    subscribeToComponentDispatch?: boolean;
    compact?: boolean;
}

type LoadState = "idle" | "loading" | "unavailable";

interface HitRowProps {
    hit: Hit;
    compact?: boolean;
    onNavigate?(): void;
}

const ChannelMessage = findComponentByCodeLazy<ChannelMessageProps>("childrenExecutedCommand:", ".hideAccessories");

const DEFAULT_AVATAR = "https://cdn.discordapp.com/embed/avatars/0.png";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

function relativeTime(timestamp: number): string {
    const elapsed = Date.now() - timestamp;

    if (elapsed < MINUTE) return "now";
    if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
    if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
    if (elapsed < WEEK) return `${Math.floor(elapsed / DAY)}d ago`;

    return new Date(timestamp).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function renderSnippet({ snippet, matchIndex, matchLength }: Hit): ReactNode {
    if (matchIndex < 0 || matchLength <= 0) return snippet;

    return (
        <>
            {snippet.slice(0, matchIndex)}
            <mark className={cl("match")}>{snippet.slice(matchIndex, matchIndex + matchLength)}</mark>
            {snippet.slice(matchIndex + matchLength)}
        </>
    );
}

function withStop(action: () => void) {
    return (event: MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        action();
    };
}

function HitRowBody({ hit, compact, onNavigate }: HitRowProps): JSX.Element {
    const { richPreview } = settings.use(["richPreview"]);
    const [loadState, setLoadState] = useState<LoadState>("idle");

    const allowRich = richPreview && !compact;
    const channel: Channel | null = ChannelStore.getChannel(hit.channelId) ?? null;
    const cached = allowRich ? peek(hit.channelId, hit.messageId) : null;
    const rich = cached !== null && channel !== null;

    const load = useCallback(async () => {
        setLoadState("loading");
        try {
            const message = await fetchMessage(hit.channelId, hit.messageId);
            setLoadState(message ? "idle" : "unavailable");
        } catch (error) {
            logger.error(`Failed to load message ${hit.messageId}`, error);
            setLoadState("unavailable");
        }
    }, [hit.channelId, hit.messageId]);

    const header = (
        <div className={cl("row-header")}>
            <span className={cl("rule-tag")}>{hit.ruleLabel}</span>
            <span className={cl("row-meta")}>
                {channel ? Parser.parse(`<#${hit.channelId}>`) : hit.channelLabel}
                {hit.guildName && ` (${hit.guildName})`}
            </span>
            <Timestamp className={cl("timestamp")} timestamp={new Date(hit.timestamp)} isInline={false}>
                {relativeTime(hit.timestamp)}
            </Timestamp>
            <div className={cl("actions")}>
                <button className={cl("action-btn")} onClick={withStop(() => jump(hit, onNavigate))}>Jump</button>
                {!hit.read && (
                    <button className={cl("action-btn")} aria-label="Mark as read" onClick={withStop(() => markRead(hit.key))}>✓</button>
                )}
                <button className={cl("action-btn")} aria-label="Dismiss" onClick={withStop(() => remove(hit.key))}>×</button>
            </div>
        </div>
    );

    return (
        <div
            className={cl("row", { "row-unread": !hit.read, "row-compact": !!compact })}
            role="button"
            tabIndex={0}
            onClick={() => jump(hit, onNavigate)}
        >
            {header}

            {rich ? (
                <div className={cl("rich")}>
                    <ChannelMessage
                        id={`vc-msgsubs-${hit.key}`}
                        message={cached}
                        channel={channel}
                        subscribeToComponentDispatch={false}
                    />
                </div>
            ) : (
                <>
                    <div className={cl("author")}>
                        <img className={cl("avatar")} src={hit.authorAvatar ?? DEFAULT_AVATAR} alt="" />
                        <span>{hit.authorName}</span>
                    </div>

                    <div className={cl("snippet")}>{renderSnippet(hit)}</div>

                    <div className={cl("badges")}>
                        {hit.attachmentCount > 0 && <span>📎 {hit.attachmentCount}</span>}
                        {hit.embedCount > 0 && <span>🖼 {hit.embedCount}</span>}
                        {loadState === "unavailable" && <span className={cl("muted")}>message unavailable</span>}
                        {allowRich && loadState !== "unavailable" && (
                            <button
                                className={cl("load-more")}
                                disabled={loadState === "loading"}
                                onClick={withStop(load)}
                            >
                                {loadState === "loading" ? "Loading…" : "Load message"}
                            </button>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

export function HitRow(props: HitRowProps): JSX.Element {
    return (
        <ErrorBoundary noop>
            <HitRowBody {...props} />
        </ErrorBoundary>
    );
}
