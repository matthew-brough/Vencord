/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { makeRange, OptionType } from "@utils/types";

import { openInbox } from "./components/InboxModal";
import { RuleEditor } from "./components/RuleEditor";
import type { Rule } from "./types";

export const settings = definePluginSettings({
    openInbox: {
        type: OptionType.COMPONENT,
        component: () => (
            <Button onClick={openInbox}>
                Open inbox
            </Button>
        )
    },
    ruleEditor: {
        type: OptionType.COMPONENT,
        component: () => <RuleEditor />
    },
    rules: {
        type: OptionType.CUSTOM,
        description: "Subscription rules",
        default: [] as Rule[]
    },
    maxHits: {
        type: OptionType.SLIDER,
        description: "How many hits to keep before the oldest are evicted",
        default: 200,
        markers: makeRange(50, 1000, 50),
        stickToMarkers: true
    },
    ignoreSelf: {
        type: OptionType.BOOLEAN,
        description: "Ignore your own messages",
        default: true
    },
    ignoreBots: {
        type: OptionType.BOOLEAN,
        description: "Ignore messages from bots",
        default: false
    },
    includeEmbeds: {
        type: OptionType.BOOLEAN,
        description: "Also match embed title/description/field text",
        default: false
    },
    captureEdits: {
        type: OptionType.BOOLEAN,
        description: "Also capture edited messages",
        default: false
    },
    richPreview: {
        type: OptionType.BOOLEAN,
        description: "Render the real message when it is still cached",
        default: true
    },
    groupByRule: {
        type: OptionType.BOOLEAN,
        description: "Group the inbox by rule",
        default: false
    },
    nativeInboxTab: {
        type: OptionType.BOOLEAN,
        description: "Show a Subscriptions tab inside Discord's own inbox popout (hiding it applies immediately, the patch itself only unloads on restart)",
        default: true
    },
    nativeTabLabel: {
        type: OptionType.STRING,
        description: "Label for that tab — the popout is narrow, keep it short",
        default: "Subs"
    }
});
