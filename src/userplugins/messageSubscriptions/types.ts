/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type MatchMode = "substring" | "word" | "regex";

export type Scope =
    | { kind: "global"; }
    | { kind: "dm"; }
    | { kind: "guild"; id: string; }
    | { kind: "channel"; id: string; };

export interface Rule {
    id: string;
    label: string;
    term: string;
    mode: MatchMode;
    caseSensitive: boolean;
    enabled: boolean;
    notify: boolean;
    scopes: Scope[];
}

export interface Hit {
    key: string;
    ruleId: string;
    ruleLabel: string;
    messageId: string;
    channelId: string;
    guildId: string | null;
    channelLabel: string;
    guildName: string | null;
    authorId: string;
    authorName: string;
    authorAvatar: string | null;
    snippet: string;
    matchIndex: number;
    matchLength: number;
    attachmentCount: number;
    embedCount: number;
    timestamp: number;
    read: boolean;
}

export interface HitFilter {
    ruleId?: string;
    query?: string;
    unreadOnly?: boolean;
}

export interface ScopeContext {
    guildId: string | null;
    channelId: string;
    isPrivate: boolean;
}

export interface MatchResult {
    index: number;
    length: number;
}

export interface StoredMeta {
    schema: number;
}

export const SCHEMA_VERSION = 1;
export const MAX_SNIPPET_LENGTH = 500;
