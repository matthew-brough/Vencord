/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { Paragraph } from "@components/Paragraph";
import { Span } from "@components/Span";
import { Switch } from "@components/Switch";
import { getCurrentChannel, getCurrentGuild } from "@utils/discord";
import type { RenderModalProps } from "@vencord/discord-types";
import { ChannelStore, ConfirmModal, GuildStore, openModal, Select, TextInput, useMemo, useState } from "@webpack/common";
import type { JSX } from "react";

import { invalidateRegexCache, isValidRegex } from "../matcher";
import { settings } from "../settings";
import { pruneRule } from "../store";
import type { MatchMode, Rule, Scope } from "../types";
import { cl } from "../utils";

const MODE_OPTIONS: ReadonlyArray<{ label: string; value: MatchMode; }> = [
    { label: "Substring", value: "substring" },
    { label: "Whole word", value: "word" },
    { label: "Regex", value: "regex" }
];

const SNOWFLAKE_PATTERN = /^\d{17,20}$/;

type MatchingFields = Partial<Pick<Rule, "term" | "mode" | "caseSensitive">>;

type ScopeListKey = "scopes" | "blockedScopes";

function makeRule(): Rule {
    return {
        id: crypto.randomUUID(),
        label: "",
        term: "",
        mode: "substring",
        caseSensitive: false,
        enabled: true,
        notify: false,
        scopes: [],
        blockedScopes: []
    };
}

// settings.store is a recursive Proxy and proxies cannot be structured cloned to the native
// settings ipc, so rules must always be read from settings.plain before being written back
function plainRules(): Rule[] {
    return settings.plain.rules ?? [];
}

function updateRule(id: string, patch: Partial<Rule>): void {
    settings.store.rules = plainRules().map(rule => rule.id === id ? { ...rule, ...patch } : rule);
}

function updateMatching(id: string, patch: MatchingFields): void {
    updateRule(id, patch);
    invalidateRegexCache(id);
}

function deleteRule(id: string): void {
    settings.store.rules = plainRules().filter(rule => rule.id !== id);
    invalidateRegexCache(id);
}

function addRule(): void {
    settings.store.rules = [...plainRules(), makeRule()];
}

function scopeKey(scope: Scope): string {
    return scope.kind === "guild" || scope.kind === "channel" ? `${scope.kind}:${scope.id}` : scope.kind;
}

function scopeLabel(scope: Scope): string {
    switch (scope.kind) {
        case "global":
            return "Global";
        case "dm":
            return "All DMs";
        case "guild":
            return GuildStore.getGuild(scope.id)?.name ?? `Guild ${scope.id}`;
        case "channel": {
            const channel = ChannelStore.getChannel(scope.id);
            return channel?.name ? `#${channel.name}` : `Channel ${scope.id}`;
        }
    }
}

function scopeById(id: string): Scope {
    return GuildStore.getGuild(id) ? { kind: "guild", id } : { kind: "channel", id };
}

function scopesOf(rule: Rule, field: ScopeListKey): Scope[] {
    return rule[field] ?? [];
}

function setScopes(id: string, field: ScopeListKey, scopes: Scope[]): void {
    updateRule(id, field === "scopes" ? { scopes } : { blockedScopes: scopes });
}

function addScope(id: string, field: ScopeListKey, scope: Scope): void {
    const rule = plainRules().find(existing => existing.id === id);
    if (!rule) return;

    const scopes = scopesOf(rule, field);
    if (scopes.some(existing => scopeKey(existing) === scopeKey(scope))) return;

    setScopes(id, field, [...scopes, scope]);
}

function removeScope(id: string, field: ScopeListKey, scope: Scope): void {
    const rule = plainRules().find(existing => existing.id === id);
    if (!rule) return;

    setScopes(id, field, scopesOf(rule, field).filter(existing => scopeKey(existing) !== scopeKey(scope)));
}

function Input({ initialValue, onChange, placeholder }: { placeholder: string; initialValue: string; onChange(value: string): void; }) {
    const [value, setValue] = useState(initialValue);

    return (
        <TextInput
            placeholder={placeholder}
            value={value}
            onChange={setValue}
            spellCheck={false}
            onBlur={() => value !== initialValue && setTimeout(() => onChange(value), 0)}
        />
    );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange(value: boolean): void; }) {
    return (
        <label className={cl("rule-field")}>
            <Span size="sm" weight="medium">{label}</Span>
            <Switch checked={checked} onChange={onChange} />
        </label>
    );
}

function DeleteRuleModal({ rule, ...modalProps }: RenderModalProps & { rule: Rule; }) {
    const [prune, setPrune] = useState(true);

    return (
        <ConfirmModal
            {...modalProps}
            title="Delete rule"
            confirmText="Delete"
            cancelText="Cancel"
            checkboxProps={{
                label: "Also delete the hits this rule collected",
                checked: prune,
                onChange: setPrune
            }}
            onConfirm={() => {
                if (prune) pruneRule(rule.id);
                deleteRule(rule.id);
            }}
        >
            <Paragraph>
                {rule.label || rule.term
                    ? `"${rule.label || rule.term}" will stop watching for new messages.`
                    : "This rule will stop watching for new messages."}
            </Paragraph>
        </ConfirmModal>
    );
}

interface ScopeListProps {
    rule: Rule;
    field: ScopeListKey;
    addLabel: string;
    emptyLabel: string;
    allowGlobal: boolean;
}

function ScopeList({ rule, field, addLabel, emptyLabel, allowGlobal }: ScopeListProps) {
    const [rawId, setRawId] = useState("");
    const { guild, channel } = useMemo(() => ({ guild: getCurrentGuild(), channel: getCurrentChannel() }), []);
    const scopes = scopesOf(rule, field);

    return (
        <div className={cl("rule-field")}>
            <div className={cl("scope-chips")}>
                {scopes.length === 0
                    ? <span className={cl("scope-chip")}>{emptyLabel}</span>
                    : scopes.map(scope => (
                        <span key={scopeKey(scope)} className={cl("scope-chip")}>
                            {scopeLabel(scope)}
                            <button aria-label={`Remove ${scopeLabel(scope)}`} onClick={() => removeScope(rule.id, field, scope)}>×</button>
                        </span>
                    ))}
            </div>
            <div className={cl("scope-add")}>
                <Span size="sm" weight="medium">{addLabel}</Span>
                {allowGlobal && (
                    <Button size="small" variant="secondary" onClick={() => addScope(rule.id, field, { kind: "global" })}>Global</Button>
                )}
                <Button size="small" variant="secondary" onClick={() => addScope(rule.id, field, { kind: "dm" })}>All DMs</Button>
                {guild && (
                    <Button size="small" variant="secondary" onClick={() => addScope(rule.id, field, { kind: "guild", id: guild.id })}>
                        This guild
                    </Button>
                )}
                {channel && (
                    <Button size="small" variant="secondary" onClick={() => addScope(rule.id, field, { kind: "channel", id: channel.id })}>
                        This channel
                    </Button>
                )}
                <TextInput
                    placeholder="Guild or channel id"
                    value={rawId}
                    onChange={setRawId}
                    spellCheck={false}
                />
                <Button
                    size="small"
                    variant="secondary"
                    disabled={!SNOWFLAKE_PATTERN.test(rawId)}
                    onClick={() => {
                        addScope(rule.id, field, scopeById(rawId));
                        setRawId("");
                    }}
                >
                    Add id
                </Button>
            </div>
        </div>
    );
}

function RuleRow({ rule }: { rule: Rule; }) {
    return (
        <div className={cl("rule-row")}>
            <div className={cl("rule-field")}>
                <Input
                    placeholder="Name (optional)"
                    initialValue={rule.label}
                    onChange={label => updateRule(rule.id, { label })}
                />
            </div>
            <div className={cl("rule-field")}>
                <Input
                    placeholder="Text to watch for"
                    initialValue={rule.term}
                    onChange={term => updateMatching(rule.id, { term })}
                />
                {rule.mode === "regex" && !isValidRegex(rule.term) && (
                    <span className={cl("error")} style={{ color: "var(--text-feedback-critical)" }}>
                        Invalid regular expression — this rule will not run
                    </span>
                )}
            </div>
            <div className={cl("rule-field")}>
                <Select
                    options={MODE_OPTIONS}
                    isSelected={(value: MatchMode) => value === rule.mode}
                    select={(value: MatchMode) => updateMatching(rule.id, { mode: value })}
                    serialize={(value: MatchMode) => value}
                />
            </div>
            <Toggle
                label="Case sensitive"
                checked={rule.caseSensitive}
                onChange={caseSensitive => updateMatching(rule.id, { caseSensitive })}
            />
            <Toggle
                label="Enabled"
                checked={rule.enabled}
                onChange={enabled => updateRule(rule.id, { enabled })}
            />
            <Toggle
                label="Notify"
                checked={rule.notify}
                onChange={notify => updateRule(rule.id, { notify })}
            />
            <ScopeList
                rule={rule}
                field="scopes"
                addLabel="Watch scope"
                emptyLabel="Global"
                allowGlobal
            />
            <ScopeList
                rule={rule}
                field="blockedScopes"
                addLabel="Blacklist scope"
                emptyLabel="Nothing blacklisted"
                allowGlobal={false}
            />
            <div className={cl("rule-actions")}>
                <Button
                    size="small"
                    variant="dangerPrimary"
                    onClick={() => openModal(modalProps => <DeleteRuleModal {...modalProps} rule={rule} />)}
                >
                    Delete rule
                </Button>
            </div>
        </div>
    );
}

function RuleList() {
    const { rules } = settings.use(["rules"]);

    return (
        <div className={cl("rule-editor")}>
            {rules.map(rule => <RuleRow key={rule.id} rule={rule} />)}
            <Button className={cl("add-rule")} onClick={addRule}>Add rule</Button>
        </div>
    );
}

export function RuleEditor(): JSX.Element {
    return (
        <ErrorBoundary>
            <RuleList />
        </ErrorBoundary>
    );
}
