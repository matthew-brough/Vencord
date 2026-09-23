/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { Logger } from "@utils/Logger";
import { Queue } from "@utils/Queue";
import { useForceUpdater } from "@utils/react";
import { useEffect } from "@webpack/common";

import { settings } from "./settings";
import { type Hit, type HitFilter, SCHEMA_VERSION, type StoredMeta } from "./types";

const HitStore = DataStore.createStore("MessageSubscriptions", "hits");
const META_KEY = "MessageSubscriptions_meta";
const PERSIST_DEBOUNCE_MS = 500;

const logger = new Logger("MessageSubscriptions", "#a3e635");
const persistQueue = new Queue();

const hits = new Map<string, Hit>();
const unread = new Map<string, number>();
const subscribers = new Set<() => void>();

const dirty = new Set<string>();
const deleted = new Set<string>();

let sorted: Hit[] | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function emit() {
    sorted = null;
    for (const subscriber of subscribers) subscriber();
}

function bumpUnread(ruleId: string, delta: number) {
    const next = (unread.get(ruleId) ?? 0) + delta;
    if (next > 0) unread.set(ruleId, next);
    else unread.delete(ruleId);
}

async function persistDirty() {
    const writes = [...dirty].map(key => hits.get(key)).filter((hit): hit is Hit => hit != null);
    const removals = [...deleted];

    dirty.clear();
    deleted.clear();

    try {
        if (writes.length) await DataStore.setMany(writes.map(hit => [hit.key, hit]), HitStore);
        if (removals.length) await DataStore.delMany(removals, HitStore);
    } catch (e) {
        logger.error("Failed to persist hits", e);
    }
}

function schedulePersist() {
    if (persistTimer !== null) return;

    persistTimer = setTimeout(() => {
        persistTimer = null;
        persistQueue.push(persistDirty);
    }, PERSIST_DEBOUNCE_MS);
}

function markDirty(key: string) {
    deleted.delete(key);
    dirty.add(key);
    schedulePersist();
}

function markDeleted(key: string) {
    dirty.delete(key);
    deleted.add(key);
    schedulePersist();
}

function evictOverflow() {
    const overflow = hits.size - settings.store.maxHits;
    if (overflow <= 0) return;

    const victims = [...hits.values()]
        .sort((a, b) => (Number(b.read) - Number(a.read)) || (a.timestamp - b.timestamp))
        .slice(0, overflow);

    for (const victim of victims) {
        hits.delete(victim.key);
        if (!victim.read) bumpUnread(victim.ruleId, -1);
        markDeleted(victim.key);
    }
}

function matchesFilter(hit: Hit, filter: HitFilter): boolean {
    if (filter.ruleId && hit.ruleId !== filter.ruleId) return false;
    if (filter.unreadOnly && hit.read) return false;

    if (filter.query) {
        const query = filter.query.toLowerCase();
        const haystack = `${hit.snippet}\n${hit.authorName}\n${hit.channelLabel}`.toLowerCase();
        if (!haystack.includes(query)) return false;
    }

    return true;
}

export function subscribe(listener: () => void): () => void {
    subscribers.add(listener);
    return () => void subscribers.delete(listener);
}

export function getHits(filter?: HitFilter): Hit[] {
    sorted ??= [...hits.values()].sort((a, b) => b.timestamp - a.timestamp);
    return filter ? sorted.filter(hit => matchesFilter(hit, filter)) : sorted;
}

export function useHits(filter?: HitFilter): Hit[] {
    const forceUpdate = useForceUpdater();
    useEffect(() => subscribe(forceUpdate), [forceUpdate]);

    return getHits(filter);
}

export function useUnreadCount(ruleId?: string): number {
    const forceUpdate = useForceUpdater();
    useEffect(() => subscribe(forceUpdate), [forceUpdate]);

    return unreadCount(ruleId);
}

export function unreadCount(ruleId?: string): number {
    if (ruleId) return unread.get(ruleId) ?? 0;

    let total = 0;
    for (const count of unread.values()) total += count;
    return total;
}

export function add(hit: Hit): void {
    if (hits.has(hit.key)) return;

    hits.set(hit.key, hit);
    if (!hit.read) bumpUnread(hit.ruleId, 1);
    markDirty(hit.key);
    evictOverflow();
    emit();
}

export function markRead(key: string): void {
    const hit = hits.get(key);
    if (!hit || hit.read) return;

    hits.set(key, { ...hit, read: true });
    bumpUnread(hit.ruleId, -1);
    markDirty(key);
    emit();
}

export function markAllRead(ruleId?: string): void {
    let changed = false;

    for (const [key, hit] of hits) {
        if (hit.read || (ruleId && hit.ruleId !== ruleId)) continue;

        hits.set(key, { ...hit, read: true });
        bumpUnread(hit.ruleId, -1);
        markDirty(key);
        changed = true;
    }

    if (changed) emit();
}

export function remove(key: string): void {
    const hit = hits.get(key);
    if (!hit) return;

    hits.delete(key);
    if (!hit.read) bumpUnread(hit.ruleId, -1);
    markDeleted(key);
    emit();
}

export function pruneRule(ruleId: string): void {
    let changed = false;

    for (const [key, hit] of hits) {
        if (hit.ruleId !== ruleId) continue;

        hits.delete(key);
        if (!hit.read) bumpUnread(ruleId, -1);
        markDeleted(key);
        changed = true;
    }

    if (changed) emit();
}

export async function clear(): Promise<void> {
    hits.clear();
    unread.clear();
    dirty.clear();
    deleted.clear();
    emit();

    persistQueue.push(() => DataStore.clear(HitStore));
    await flush();
}

export async function load(): Promise<void> {
    try {
        const meta = await DataStore.get<StoredMeta>(META_KEY);

        if (meta?.schema !== SCHEMA_VERSION) {
            if (meta != null) logger.warn(`Schema ${meta.schema} != ${SCHEMA_VERSION}, dropping stored hits`);
            await DataStore.clear(HitStore);
            await DataStore.set(META_KEY, { schema: SCHEMA_VERSION } satisfies StoredMeta);
            return;
        }

        for (const hit of await DataStore.values<Hit>(HitStore)) {
            hits.set(hit.key, hit);
            if (!hit.read) bumpUnread(hit.ruleId, 1);
        }

        evictOverflow();
        emit();
    } catch (e) {
        logger.error("Failed to load hits", e);
    }
}

export function flush(): Promise<void> {
    if (persistTimer !== null) {
        clearTimeout(persistTimer);
        persistTimer = null;
    }

    persistQueue.push(persistDirty);

    return new Promise<void>(resolve => persistQueue.push(() => void resolve()));
}
