/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@utils/css";
import { Logger } from "@utils/Logger";
import type { Channel, Guild, User } from "@vencord/discord-types";
import { ChannelStore, closeAllModals, GuildStore, NavigationRouter } from "@webpack/common";

import { markRead } from "./store";
import { type Hit, MAX_SNIPPET_LENGTH } from "./types";

export const cl = classNameFactory("vc-msgsubs-");
export const logger = new Logger("MessageSubscriptions", "#a3e635");

export function describeChannel(channel: Channel): Pick<Hit, "channelLabel" | "guildName" | "threadName"> {
    const guild: Guild | undefined = channel.guild_id ? GuildStore.getGuild(channel.guild_id) : undefined;

    if (channel.isDM()) return { channelLabel: `DM — ${channel.rawRecipients?.[0]?.username ?? "Unknown"}`, guildName: null, threadName: null };
    if (channel.isGroupDM()) return { channelLabel: `Group — ${channel.name || channel.rawRecipients?.map(r => r.username).join(", ") || "Unnamed"}`, guildName: null, threadName: null };

    if (channel.isThread()) {
        const parent: Channel | undefined = channel.parent_id ? ChannelStore.getChannel(channel.parent_id) : undefined;

        return {
            channelLabel: parent ? `#${parent.name}` : "#unknown",
            guildName: guild?.name ?? null,
            threadName: channel.name
        };
    }

    return { channelLabel: `#${channel.name}`, guildName: guild?.name ?? null, threadName: null };
}

export function locationOf(hit: Hit): string {
    return [hit.guildName, hit.channelLabel, hit.threadName && `thread:${hit.threadName}`]
        .filter((part): part is string => !!part)
        .join(" — ");
}

export function describeAuthor(author: User): { authorName: string; authorAvatar: string | null; } {
    const authorName = (author as User & { globalName?: string; }).globalName || author.username;
    const authorAvatar = author.avatar
        ? `https://cdn.discordapp.com/avatars/${author.id}/${author.avatar}.png?size=64`
        : null;

    return { authorName, authorAvatar };
}

export function truncateSnippet(text: string, matchIndex: number, matchLength: number): Pick<Hit, "snippet" | "matchIndex" | "matchLength"> {
    if (text.length <= MAX_SNIPPET_LENGTH) return { snippet: text, matchIndex, matchLength };

    const contextBefore = 120;
    const start = Math.max(0, Math.min(matchIndex - contextBefore, text.length - MAX_SNIPPET_LENGTH));
    const sliced = text.slice(start, start + MAX_SNIPPET_LENGTH);
    const snippet = (start > 0 ? "…" : "") + sliced + (start + MAX_SNIPPET_LENGTH < text.length ? "…" : "");
    const shifted = matchIndex - start + (start > 0 ? 1 : 0);
    const withinSnippet = shifted >= 0 && shifted + matchLength <= snippet.length;

    return {
        snippet,
        matchIndex: withinSnippet ? shifted : -1,
        matchLength: withinSnippet ? matchLength : 0
    };
}

export function messageUrl(hit: Hit): string {
    return `/channels/${hit.guildId ?? "@me"}/${hit.channelId}/${hit.messageId}`;
}

export function jump(hit: Hit, close?: () => void): void {
    markRead(hit.key);
    closeAllModals();
    close?.();
    NavigationRouter.transitionTo(messageUrl(hit));
}
