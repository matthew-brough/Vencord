/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Checkbox, Select, TextInput, useEffect, useRef, useState } from "@webpack/common";

import { settings } from "../settings";
import { unreadCount } from "../store";
import type { HitFilter, Rule } from "../types";
import { cl } from "../utils";

const SEARCH_DEBOUNCE_MS = 150;
const ALL_RULES = "";

export function InboxToolbar({ filter, setFilter, rules, compact }: {
    filter: HitFilter;
    setFilter(next: HitFilter): void;
    rules: Rule[];
    compact?: boolean;
}) {
    const { groupByRule } = settings.use(["groupByRule"]);

    const [query, setQuery] = useState(filter.query ?? "");
    const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const latestFilter = useRef(filter);
    latestFilter.current = filter;

    useEffect(() => () => clearTimeout(debounce.current), []);
    useEffect(() => setQuery(filter.query ?? ""), [filter.query]);

    function onQueryChange(value: string) {
        setQuery(value);
        clearTimeout(debounce.current);
        debounce.current = setTimeout(
            () => setFilter({ ...latestFilter.current, query: value || undefined }),
            SEARCH_DEBOUNCE_MS
        );
    }

    const options = [
        { label: `All (${unreadCount()} unread)`, value: ALL_RULES },
        ...rules.map(rule => ({
            label: `${rule.label || rule.term} (${unreadCount(rule.id)} unread)`,
            value: rule.id
        }))
    ];

    return (
        <div className={cl("toolbar", { "toolbar-compact": !!compact })}>
            <Select
                className={cl("toolbar-select")}
                options={options}
                isSelected={(value: string) => value === (filter.ruleId ?? ALL_RULES)}
                select={(value: string) => setFilter({ ...latestFilter.current, ruleId: value || undefined })}
                serialize={(value: string) => value}
            />

            <TextInput
                className={cl("toolbar-search")}
                value={query}
                placeholder={compact ? "Search" : "Search snippets, authors, channels"}
                onChange={onQueryChange}
            />

            <div className={cl("toolbar-toggles")}>
                <Checkbox
                    value={filter.unreadOnly ?? false}
                    onChange={(_, value) => setFilter({ ...latestFilter.current, unreadOnly: value })}
                    size={20}
                >
                    <span>{compact ? "Unread" : "Unread only"}</span>
                </Checkbox>

                {!compact && (
                    <Checkbox
                        value={groupByRule}
                        onChange={(_, value) => { settings.store.groupByRule = value; }}
                        size={20}
                    >
                        <span>Group by rule</span>
                    </Checkbox>
                )}
            </div>
        </div>
    );
}
