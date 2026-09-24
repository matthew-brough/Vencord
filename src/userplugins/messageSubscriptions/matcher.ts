/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { MatchMode, MatchResult, Rule, Scope, ScopeContext } from "./types";

interface CompiledRule {
    term: string;
    mode: MatchMode;
    caseSensitive: boolean;
    regex: RegExp | null;
}

const compiled = new Map<string, CompiledRule>();

const WORD_CHARACTER = /\w/;

function escapeRegex(term: string): string {
    return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// \b only means "word boundary" next to a word character, so a term edged by punctuation keeps substring semantics on that side
function wordPattern(term: string): string {
    const start = WORD_CHARACTER.test(term[0]) ? "\\b" : "";
    const end = WORD_CHARACTER.test(term[term.length - 1]) ? "\\b" : "";

    return `${start}${escapeRegex(term)}${end}`;
}

function compileRegex(term: string, mode: MatchMode, caseSensitive: boolean): RegExp | null {
    try {
        return new RegExp(mode === "regex" ? term : wordPattern(term), caseSensitive ? "" : "i");
    } catch {
        return null;
    }
}

function regexFor(rule: Rule): RegExp | null {
    const cached = compiled.get(rule.id);
    if (cached && cached.term === rule.term && cached.mode === rule.mode && cached.caseSensitive === rule.caseSensitive)
        return cached.regex;

    const regex = compileRegex(rule.term, rule.mode, rule.caseSensitive);
    compiled.set(rule.id, { term: rule.term, mode: rule.mode, caseSensitive: rule.caseSensitive, regex });

    return regex;
}

function scopeMatches(scope: Scope, ctx: ScopeContext): boolean {
    switch (scope.kind) {
        case "global": return true;
        case "dm": return ctx.isPrivate;
        case "guild": return ctx.guildId === scope.id;
        case "channel": return ctx.channelId === scope.id;
    }
}

export function findMatch(text: string, rule: Rule): MatchResult | null {
    if (!text || !rule.term) return null;

    if (rule.mode === "substring") {
        const index = rule.caseSensitive
            ? text.indexOf(rule.term)
            : text.toLowerCase().indexOf(rule.term.toLowerCase());

        return index === -1 ? null : { index, length: rule.term.length };
    }

    const regex = regexFor(rule);
    if (!regex) return null;

    const match = regex.exec(text);

    return match ? { index: match.index, length: match[0].length } : null;
}

export function ruleMatchesScope(rule: Rule, ctx: ScopeContext): boolean {
    if (rule.blockedScopes?.some(scope => scopeMatches(scope, ctx))) return false;
    if (rule.scopes.length === 0) return true;

    return rule.scopes.some(scope => scopeMatches(scope, ctx));
}

export function invalidateRegexCache(ruleId?: string): void {
    if (ruleId === undefined) compiled.clear();
    else compiled.delete(ruleId);
}

export function isValidRegex(term: string): boolean {
    try {
        return new RegExp(term) instanceof RegExp;
    } catch {
        return false;
    }
}
