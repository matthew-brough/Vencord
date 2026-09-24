/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { plugins } from "@api/PluginManager";
import { Button } from "@components/Button";
import { ExpandableSection } from "@components/ExpandableCard";
import { openPluginModal } from "@components/settings";
import { useCallback, useMemo, useState } from "@webpack/common";
import type { JSX } from "react";

import { exportHits } from "../export";
import { settings } from "../settings";
import { getHits, useHits } from "../store";
import type { Hit, HitFilter, Rule } from "../types";
import { cl } from "../utils";
import { HitRow } from "./HitRow";
import { InboxToolbar } from "./InboxToolbar";

const PLUGIN_NAME = "MessageSubscriptions";

export type InboxVariant = "modal" | "panel";

export interface InboxState {
    rules: Rule[];
    groupByRule: boolean;
    filter: HitFilter;
    setFilter(next: HitFilter): void;
    hits: Hit[];
    visible: Hit[];
    remaining: number;
    unread: number;
    isFiltered: boolean;
    showMore(): void;
}

export function countUnread(hits: Hit[]): number {
    return hits.reduce((count, hit) => hit.read ? count : count + 1, 0);
}

function groupByRuleId(hits: Hit[]): Hit[][] {
    const groups = new Map<string, Hit[]>();

    for (const hit of hits) {
        const group = groups.get(hit.ruleId);
        if (group) group.push(hit);
        else groups.set(hit.ruleId, [hit]);
    }

    return [...groups.values()];
}

export function useInboxState(pageSize: number): InboxState {
    const { rules, groupByRule } = settings.use(["rules", "groupByRule"]);
    const [filter, setFilterState] = useState<HitFilter>({});
    const [page, setPage] = useState(pageSize);

    const hits = useHits(filter);

    const setFilter = useCallback((next: HitFilter) => {
        setFilterState(next);
        setPage(pageSize);
    }, [pageSize]);

    const showMore = useCallback(() => setPage(current => current + pageSize), [pageSize]);

    const visible = useMemo(() => hits.slice(0, page), [hits, page]);
    const unread = useMemo(() => countUnread(hits), [hits]);

    return {
        rules,
        groupByRule,
        filter,
        setFilter,
        hits,
        visible,
        remaining: Math.max(0, hits.length - visible.length),
        unread,
        isFiltered: filter.ruleId != null || !!filter.query || filter.unreadOnly === true,
        showMore
    };
}

export function InboxBody({ variant, state, onNavigate }: {
    variant: InboxVariant;
    state: InboxState;
    onNavigate?(): void;
}): JSX.Element {
    const { rules, groupByRule, filter, setFilter, hits, visible, remaining, isFiltered, showMore } = state;
    const compact = variant === "panel";

    const groups = useMemo(() => groupByRule ? groupByRuleId(visible) : [], [visible, groupByRule]);

    const openRuleSettings = useCallback(() => {
        onNavigate?.();
        const plugin = plugins[PLUGIN_NAME];
        if (plugin) openPluginModal(plugin);
    }, [onNavigate]);

    function renderList() {
        if (rules.length === 0) {
            return (
                <div className={cl("empty")}>
                    <span>No subscriptions yet</span>
                    <Button size="small" onClick={openRuleSettings}>Add rule</Button>
                </div>
            );
        }

        if (hits.length === 0) {
            return isFiltered
                ? (
                    <div className={cl("empty")}>
                        <span>No hits for this filter</span>
                        <Button size="small" variant="secondary" onClick={() => setFilter({})}>Clear filters</Button>
                    </div>
                )
                : (
                    <div className={cl("empty")}>
                        <span>Nothing matched yet — watching {rules.length} rule{rules.length === 1 ? "" : "s"}</span>
                    </div>
                );
        }

        return (
            <div className={cl("list")}>
                {groupByRule
                    ? groups.map(group => (
                        <ExpandableSection
                            key={group[0].ruleId}
                            className={cl("group")}
                            initialExpanded={!compact}
                            renderContent={() => group.map(hit => (
                                <HitRow key={hit.key} hit={hit} compact={compact} onNavigate={onNavigate} />
                            ))}
                        >
                            <span className={cl("group-header")}>
                                <span>{group[0].ruleLabel} ({group.length}, {countUnread(group)} unread)</span>

                                <Button
                                    className={cl("group-export")}
                                    size="xs"
                                    variant="secondary"
                                    onClick={event => {
                                        event.stopPropagation();
                                        exportHits(getHits({ ruleId: group[0].ruleId }), group[0].ruleLabel);
                                    }}
                                >
                                    Export
                                </Button>
                            </span>
                        </ExpandableSection>
                    ))
                    : visible.map(hit => (
                        <HitRow key={hit.key} hit={hit} compact={compact} onNavigate={onNavigate} />
                    ))}

                {remaining > 0 && (
                    <Button
                        className={cl("load-more")}
                        size="small"
                        variant="secondary"
                        onClick={showMore}
                    >
                        Load more ({remaining} left)
                    </Button>
                )}
            </div>
        );
    }

    return (
        <div className={cl("body", { "body-compact": compact })}>
            {rules.length > 0 && (
                <InboxToolbar filter={filter} setFilter={setFilter} rules={rules} compact={compact} />
            )}
            {renderList()}
        </div>
    );
}
