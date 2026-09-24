/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { ApplicationCommandInputType } from "@api/Commands";
import { showNotification } from "@api/Notifications";
import definePlugin from "@utils/types";
import type { User } from "@vencord/discord-types";
import { ChannelStore, Menu, UserStore } from "@webpack/common";

import { openInbox } from "./components/InboxModal";
import { findMatch, isValidRegex, ruleMatchesScope } from "./matcher";
import { isActive, renderPanel, renderTabItem, selectedItem, wrapSelect } from "./nativeInbox";
import { settings } from "./settings";
import { add, flush, load, unreadCount } from "./store";
import type { Hit, Rule } from "./types";
import { describeAuthor, describeChannel, jump, logger, truncateSnippet } from "./utils";

interface RawEmbed {
    title?: string;
    rawTitle?: string;
    description?: string;
    rawDescription?: string;
    fields?: { name?: string; value?: string; }[];
    footer?: { text?: string; };
    author?: { name?: string; };
}

interface GatewayMessage {
    id: string;
    channel_id: string;
    guild_id?: string;
    author?: User & { bot?: boolean; };
    content?: string;
    timestamp?: string;
    edited_timestamp?: string;
    attachments?: unknown[];
    embeds?: RawEmbed[];
    webhook_id?: string;
}

function embedText(embeds: RawEmbed[]): string {
    return embeds
        .flatMap(embed => [
            embed.rawTitle ?? embed.title,
            embed.rawDescription ?? embed.description,
            embed.author?.name,
            embed.footer?.text,
            ...(embed.fields ?? []).flatMap(field => [field.name, field.value])
        ])
        .filter((part): part is string => !!part)
        .join("\n");
}

const warnedRules = new Set<string>();

function warnInvalidRegex(rule: Rule) {
    if (rule.mode !== "regex" || isValidRegex(rule.term) || warnedRules.has(rule.id)) return;

    warnedRules.add(rule.id);
    logger.warn(`Rule "${rule.label || rule.term}" has an invalid regex and will never match`);
}

function matchableText(message: GatewayMessage): string {
    const content = message.content ?? "";
    if (!settings.store.includeEmbeds || !message.embeds?.length) return content;

    return `${content}\n${embedText(message.embeds)}`.trim();
}

function notify(hit: Hit) {
    showNotification({
        title: `${hit.ruleLabel} — ${hit.authorName}`,
        body: hit.snippet,
        icon: hit.authorAvatar ?? undefined,
        onClick: () => jump(hit)
    });
}

function handleMessage(message: GatewayMessage) {
    const { rules } = settings.store;
    if (!rules.length || !message.author) return;
    if (settings.store.ignoreSelf && message.author.id === UserStore.getCurrentUser()?.id) return;
    if (settings.store.ignoreBots && (message.author.bot || message.webhook_id != null)) return;

    const text = matchableText(message);
    if (!text) return;

    const channel = ChannelStore.getChannel(message.channel_id);
    if (!channel) return;

    const scopeContext = {
        guildId: channel.guild_id ?? null,
        channelId: channel.id,
        isPrivate: channel.isPrivate()
    };

    const { channelLabel, guildName, threadName } = describeChannel(channel);
    const { authorName, authorAvatar } = describeAuthor(message.author);
    const timestamp = message.timestamp ? new Date(message.timestamp).getTime() : Date.now();

    for (const rule of rules) {
        if (!rule.enabled) continue;
        warnInvalidRegex(rule);
        if (!ruleMatchesScope(rule, scopeContext)) continue;

        const match = findMatch(text, rule);
        if (!match) continue;

        const hit: Hit = {
            key: `${rule.id}:${message.id}`,
            ruleId: rule.id,
            ruleLabel: rule.label || rule.term,
            messageId: message.id,
            channelId: channel.id,
            guildId: channel.guild_id ?? null,
            channelLabel,
            guildName,
            threadName,
            authorId: message.author.id,
            authorName,
            authorAvatar,
            attachmentCount: message.attachments?.length ?? 0,
            embedCount: message.embeds?.length ?? 0,
            timestamp: Number.isNaN(timestamp) ? Date.now() : timestamp,
            read: false,
            ...truncateSnippet(text, match.index, match.length)
        };

        add(hit);
        if (rule.notify) notify(hit);
    }
}

export default definePlugin({
    name: "MessageSubscriptions",
    description: "Subscribe to substrings in messages you can see and collect every match in one inbox with jump links. Adds a tab to Discord's inbox popout, so enabling or disabling the plugin needs a restart",
    authors: [{ name: "artemOP", id: 0n }],
    settings,

    patches: [
        {
            // inbox popout: tab strip (sv) and body switch (s6) live in one module
            find: '.UNREADS,"aria-label"',
            group: true,
            replacement: [
                {
                    match: /selectedItem:(\i),type:"top",look:"brand",onItemSelect:(\i),/,
                    replace: 'selectedItem:$self.selectedItem($1),type:"top",look:"brand",onItemSelect:$self.wrapSelect($2),'
                },
                {
                    match: /(children:\[)(?=\(0,\i\.jsx\)\(\i\.\i\.Item,\{id:\i\.\i\.UNREADS)/,
                    replace: "$1$self.renderTabItem(),"
                },
                {
                    match: /(component:\(0,\i\.jsx\)\(\i,\{tab:\i,setTab:\i,closePopout:(\i)\}\),children:)/,
                    replace: "$1$self.isActive()?$self.renderPanel({closePopout:$2}):"
                }
            ]
        }
    ],

    selectedItem,
    wrapSelect,
    isActive,
    renderTabItem,
    renderPanel,

    flux: {
        MESSAGE_CREATE({ message, optimistic }: { message: GatewayMessage; optimistic: boolean; }) {
            if (optimistic) return;

            try {
                handleMessage(message);
            } catch (e) {
                logger.error("Failed to handle MESSAGE_CREATE", e);
            }
        },

        MESSAGE_UPDATE({ message }: { message: GatewayMessage; }) {
            if (!settings.store.captureEdits || !message?.content) return;

            try {
                handleMessage(message);
            } catch (e) {
                logger.error("Failed to handle MESSAGE_UPDATE", e);
            }
        }
    },

    commands: [
        {
            name: "subscriptions",
            description: "Open the message subscriptions inbox",
            inputType: ApplicationCommandInputType.BUILT_IN,
            execute: () => void openInbox()
        }
    ],

    toolboxActions: () => {
        const unread = unreadCount();

        return (
            <Menu.MenuItem
                id="vc-msgsubs-open"
                label={unread ? `Subscriptions (${unread})` : "Subscriptions"}
                action={openInbox}
            />
        );
    },

    async start() {
        await load();
    },

    async stop() {
        await flush();
    }
});
