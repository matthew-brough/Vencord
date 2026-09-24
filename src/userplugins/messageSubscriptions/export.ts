/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { saveFile } from "@utils/web";
import { Toasts } from "@webpack/common";

import { settings } from "./settings";
import type { Hit } from "./types";
import { locationOf, logger, messageUrl } from "./utils";

const DISCORD_ORIGIN = "https://discord.com";
const MIME_TYPE = "application/x-ndjson";

interface ExportRecord {
    ts: string;
    location: string;
    content: string;
    rule: string;
    ruleId: string;
    term: string | null;
    matchIndex: number;
    matchLength: number;
    author: string;
    authorId: string;
    messageId: string;
    channelId: string;
    guildId: string | null;
    threadName: string | null;
    url: string;
    attachments: number;
    embeds: number;
    read: boolean;
}

function toRecord(hit: Hit, terms: Map<string, string>): ExportRecord {
    return {
        ts: new Date(hit.timestamp).toISOString(),
        location: locationOf(hit),
        content: hit.snippet,
        rule: hit.ruleLabel,
        ruleId: hit.ruleId,
        term: terms.get(hit.ruleId) ?? null,
        matchIndex: hit.matchIndex,
        matchLength: hit.matchLength,
        author: hit.authorName,
        authorId: hit.authorId,
        messageId: hit.messageId,
        channelId: hit.channelId,
        guildId: hit.guildId,
        threadName: hit.threadName,
        url: `${DISCORD_ORIGIN}${messageUrl(hit)}`,
        attachments: hit.attachmentCount,
        embeds: hit.embedCount,
        read: hit.read
    };
}

function ruleTerms(): Map<string, string> {
    return new Map(settings.store.rules.map(rule => [rule.id, rule.term]));
}

export function toJsonl(hits: Hit[]): string {
    const terms = ruleTerms();

    return hits.map(hit => `${JSON.stringify(toRecord(hit, terms))}\n`).join("");
}

function slugify(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "export";
}

export function fileNameFor(label: string): string {
    return `message-subscriptions-${slugify(label)}-${new Date().toISOString().slice(0, 10)}.jsonl`;
}

function toast(message: string, type: string) {
    Toasts.show({ message, type, id: Toasts.genId() });
}

export function exportHits(hits: Hit[], label: string): void {
    if (!hits.length) {
        toast("Nothing to export", Toasts.Type.MESSAGE);
        return;
    }

    try {
        saveFile(new File([toJsonl(hits)], fileNameFor(label), { type: MIME_TYPE }));
        toast(`Exported ${hits.length} hit${hits.length === 1 ? "" : "s"}`, Toasts.Type.SUCCESS);
    } catch (e) {
        logger.error("Failed to export hits", e);
        toast("Export failed (check console)", Toasts.Type.FAILURE);
    }
}
