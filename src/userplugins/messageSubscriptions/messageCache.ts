/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { Message } from "@vencord/discord-types";
import { Constants, MessageStore, RestAPI } from "@webpack/common";

import { logger } from "./utils";

interface RawMessage {
    id: string;
    channel_id: string;
}

interface MessagesResponse {
    body?: RawMessage[];
}

type CacheEntry = Message | null | Promise<Message | null>;

const cache = new Map<string, CacheEntry>();

const cacheKey = (channelId: string, messageId: string) => `${channelId}:${messageId}`;

export function peek(channelId: string, messageId: string): Message | null {
    const cached = cache.get(cacheKey(channelId, messageId));
    if (cached && !(cached instanceof Promise)) return cached;

    return MessageStore.getMessage(channelId, messageId) ?? null;
}

export function fetchMessage(channelId: string, messageId: string): Promise<Message | null> {
    const key = cacheKey(channelId, messageId);

    const cached = cache.get(key);
    if (cached !== undefined) return Promise.resolve(cached);

    const pending = request(channelId, messageId).then(message => {
        cache.set(key, message);
        return message;
    });

    cache.set(key, pending);

    return pending;
}

export function clearMessageCache(): void {
    cache.clear();
}

async function request(channelId: string, messageId: string): Promise<Message | null> {
    const res: MessagesResponse | null = await RestAPI.get({
        url: Constants.Endpoints.MESSAGES(channelId),
        query: {
            limit: 1,
            around: messageId
        },
        retries: 2
    }).catch(() => null);

    const raw = res?.body?.[0];
    if (!raw) {
        logger.warn(`Could not fetch message ${messageId} in channel ${channelId}`);
        return null;
    }

    if (raw.id !== messageId) {
        logger.warn(`Message ${messageId} in channel ${channelId} no longer exists`);
        return null;
    }

    const message = MessageStore.getMessages(raw.channel_id).receiveMessage(raw).get(raw.id);
    if (!message) {
        logger.warn(`Message ${messageId} was fetched but not received into the store`);
        return null;
    }

    return message;
}
