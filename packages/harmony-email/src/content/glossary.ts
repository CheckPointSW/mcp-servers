/**
 * The HEC glossary, served as the `hec://glossary` resource.
 *
 * This is the authoritative source for the vocabulary the persona tells the
 * model to use: engine names, severity values, event types and states, restore
 * semantics, and the Anti-Phishing exception types. It is deliberately editable
 * by non-engineers.
 *
 * Inlined rather than read from disk because the package is bundled to a single
 * file by esbuild and the build copies nothing but server-config.json.
 */

export interface GlossaryValue {
    value: string;
    description?: string;
}

export interface GlossaryTerm {
    term: string;
    definition: string;
    aliases?: string[];
    confusable_with?: string[];
    disambiguation?: string;
    values?: GlossaryValue[];
    api_field?: string;
    note?: string;
}

export interface Glossary {
    version: number;
    terms: GlossaryTerm[];
}

export const GLOSSARY: Glossary = {
    version: 1,
    terms: [
        {
            term: 'Entity',
            definition:
                'A scanned object in HEC — most often an email, but also a file, OneDrive document, SharePoint item, Teams message, etc.',
            aliases: ['email', 'message', 'item', 'object'],
            confusable_with: ['Event'],
            disambiguation:
                'An entity is the THING that was scanned (an email). An event is what HAPPENED to or because of that entity (a phishing detection, a DLP match).',
        },
        {
            term: 'Event',
            definition:
                'A security finding recorded against one or more entities — a phishing detection, malware verdict, DLP match, anomaly, malicious-URL click, etc.',
            aliases: ['security event', 'alert', 'incident', 'detection'],
            confusable_with: ['Entity'],
            disambiguation:
                'See Entity. Events have severity and lifecycle states; entities have verdicts and restore flags.',
        },
        {
            term: 'Verdict',
            definition:
                "An engine's conclusion about a single entity (e.g. `clean`, `phishing`, `suspicious`, `malicious`, `spam`). Returned per engine under `entity_security_result`.",
            aliases: ['score', 'rating', 'classification'],
            confusable_with: ['Severity'],
            disambiguation:
                'Verdict is what an ENGINE says about an entity. Severity is how SERIOUS an event is.',
        },
        {
            term: 'Combined Verdict',
            definition:
                'The aggregated verdict across all engines for an entity. Surfaced as `combined_verdict` on the entity security result.',
            aliases: ['overall verdict', 'summary verdict'],
        },
        {
            term: 'Engine',
            definition:
                'A detection module that produces verdicts on entities. HEC ships five: Anti-Phishing, Data Loss Prevention, Click-time Protection, Shadow IT, Antivirus.',
            aliases: ['sectool', 'module', 'detection engine'],
        },
        {
            term: 'Anti-Phishing',
            api_field: 'ap',
            definition:
                'The phishing-detection engine. Verdicts include `phishing`, `suspicious`, `spam`, `clean`.',
            aliases: ['AP', 'phishing engine', 'ap_avanan'],
            confusable_with: ['Anti-Phishing Exception'],
            disambiguation:
                'The engine produces phishing verdicts. The exception is an admin override telling the engine to allow or block specific senders/URLs.',
        },
        {
            term: 'Data Loss Prevention',
            api_field: 'dlp',
            definition:
                'The data-loss-prevention engine. Flags entities that match data-leak policies; verdict shows as `leak` when matched.',
            aliases: ['DLP'],
        },
        {
            term: 'Click-time Protection',
            api_field: 'clicktimeProtection',
            definition:
                'The URL-rewriting engine. Inspects links when clicked and flags malicious URLs at click time, not delivery time.',
            aliases: ['CTP', 'click-time', 'URL protection'],
        },
        {
            term: 'Shadow IT',
            api_field: 'shadowIt',
            definition:
                'The engine that surfaces unsanctioned SaaS usage discovered from email traffic.',
            aliases: ['SIT', 'shadow-IT'],
        },
        {
            term: 'Antivirus',
            api_field: 'av',
            definition:
                'The malware-scanning engine. Verdicts include `malicious`, `suspicious`, `clean`.',
            aliases: ['AV'],
        },
        {
            term: 'Scope',
            definition:
                'The `farm:customer` string identifying which tenant a SmartAPI call targets. Attached to every request as the `scopes` header by this server.',
            aliases: ['tenant scope', 'scope string'],
            confusable_with: ['Tenant', 'API scope'],
            disambiguation:
                "In HEC, `scope` is the routing key (farm:customer). It is NOT the OAuth-style 'scope' that grants permissions.",
        },
        {
            term: 'Tenant',
            definition:
                'A single HEC customer account. One MCP server instance is bound to exactly one tenant via its configured scope.',
            aliases: ['customer', 'organization', 'org'],
        },
        {
            term: 'Farm',
            definition:
                'The HEC infrastructure cluster a tenant lives on (e.g. `mt-prod-cp-us-2`). The first half of a scope string.',
        },
        {
            term: 'SaaS source',
            api_field: 'saas',
            definition:
                'The platform an entity came from. Used as a filter on the entity query.',
            aliases: ['saas', 'source platform'],
            values: [
                {
                    value: 'office365_emails',
                    description: 'Microsoft 365 mail',
                },
                {
                    value: 'office365_onedrive',
                    description: 'OneDrive for Business',
                },
                {
                    value: 'office365_sharepoint',
                    description: 'SharePoint Online',
                },
                {
                    value: 'google_mail',
                    description: 'Gmail / Google Workspace mail',
                },
                {
                    value: 'google_drive',
                    description: 'Google Drive',
                },
                {
                    value: 'ms_teams',
                    description: 'Microsoft Teams messages',
                },
                {
                    value: 'slack',
                    description: 'Slack messages',
                },
                {
                    value: 'box2',
                    description:
                        'Box (note the `2` suffix is intentional in the API)',
                },
                {
                    value: 'dropbox2',
                    description: 'Dropbox (note the `2` suffix)',
                },
                {
                    value: 'sharefile',
                    description: 'Citrix ShareFile',
                },
                {
                    value: 'email',
                    description: 'Generic/legacy email source',
                },
            ],
        },
        {
            term: 'Restore Request',
            api_field: 'entityPayload.isRestoreRequested',
            definition:
                'An end-user or admin asking HEC to release a quarantined entity. Represented on the entity payload via the `isRestoreRequested` flag, with `restoreRequestTime` and optional `restoreCommentary` siblings.',
            aliases: ['restore', 'release request', 'unquarantine'],
            note: 'There is no dedicated /restore-request endpoint. Pending restore requests are surfaced by filtering entities on entityPayload.isRestoreRequested=true AND entityPayload.isRestored=false AND entityPayload.isRestoreDeclined=false. The `entityPayload.` prefix is required — `saasAttrName` in `entityExtendedFilter` is a dotted-path attribute (see `SaasEntityExtendedFilter` in the SmartAPI source).',
        },
        {
            term: 'Restore Decline',
            api_field: 'entityPayload.isRestoreDeclined',
            definition:
                "An admin's decision to deny a restore request. Surfaced as `entityPayload.isRestoreDeclined=true` on the entity, with a `restoreDeclineReason` field.",
            aliases: ['denied restore', 'rejected restore'],
        },
        {
            term: 'Restored',
            api_field: 'entityPayload.isRestored',
            definition:
                'Boolean on the entity payload indicating the message has been released from quarantine. Filter as `entityPayload.isRestored=true` in `entityExtendedFilter`.',
        },
        {
            term: 'Action Mode',
            api_field: 'action_mode',
            definition:
                'On an entity action record, distinguishes a human-initiated action from a policy-driven one.',
            aliases: ['restore type', 'remediation type'],
            values: [
                {
                    value: 'manual',
                    description:
                        "Human (end-user or admin) initiated the action — what customers call a 'manual restore'.",
                },
                {
                    value: 'policy',
                    description:
                        "Triggered by an automated HEC policy ('Detect-and-Prevent' / `dnp_action`). What customers call an 'automatic restore'.",
                },
            ],
            note: 'Use this field to bucket restore-request trends by manual vs. automatic.',
        },
        {
            term: 'Quarantine',
            definition:
                "The HEC remediation that removes a malicious or suspicious entity from the user's mailbox and holds it for review. The opposite of Restore.",
            aliases: ['quarantined', 'hold'],
        },
        {
            term: 'End-User Phishing Report',
            definition:
                "An end user clicking the 'Report Phishing' button in Outlook/Gmail. HEC tracks this as a `report_phishing` user-interaction setting on the tenant.",
            aliases: [
                'phishing report',
                'user-reported phishing',
                'PhishAlarm',
            ],
            confusable_with: ['Restore Request'],
            disambiguation:
                'An end-user phishing report is the user FLAGGING something as bad. A restore request is the user asking for something to be released as good.',
            note: 'Not queryable via the current MCP tools — the `/user-interactions/{setting_type}` endpoint is not wrapped yet.',
        },
        {
            term: 'Anti-Phishing Exception',
            definition:
                'An admin-configured override telling the Anti-Phishing engine to allow, block, or treat-as-spam mail matching specific criteria (sender, domain, subject, link, attachment hash, …).',
            aliases: [
                'AP exception',
                'allow/block list',
                'whitelist/blacklist',
            ],
            values: [
                {
                    value: 'whitelist',
                    description: 'Always allow matching mail through.',
                },
                {
                    value: 'blacklist',
                    description: 'Always block matching mail.',
                },
                {
                    value: 'spam_whitelist',
                    description:
                        'Allow through the spam filter (but still subject to phishing/malware checks).',
                },
            ],
        },
        {
            term: 'Event Type',
            api_field: 'eventTypes',
            definition:
                'The category of finding an event records. Filter on this in event queries.',
            values: [
                {
                    value: 'phishing',
                    description: 'Confirmed phishing.',
                },
                {
                    value: 'suspicious_phishing',
                    description: 'Likely-but-not-certain phishing.',
                },
                {
                    value: 'malware',
                    description: 'Confirmed malware.',
                },
                {
                    value: 'suspicious_malware',
                    description: 'Likely-but-not-certain malware.',
                },
                {
                    value: 'spam',
                    description: 'Confirmed spam.',
                },
                {
                    value: 'graymail',
                    description: 'Bulk/marketing mail; not malicious.',
                },
                {
                    value: 'dlp',
                    description: 'Data-loss-prevention policy match.',
                },
                {
                    value: 'anomaly',
                    description:
                        'Behavioral anomaly (account takeover signal, unusual login, etc.).',
                },
                {
                    value: 'shadow_it',
                    description:
                        'Unsanctioned SaaS activity surfaced from email traffic.',
                },
                {
                    value: 'malicious_url',
                    description:
                        'URL flagged as malicious by Click-time Protection.',
                },
                {
                    value: 'malicious_url_click',
                    description:
                        'A user actually clicked a URL that was/became malicious.',
                },
                {
                    value: 'alert',
                    description:
                        'Generic alert; check the description for specifics.',
                },
            ],
        },
        {
            term: 'Event State',
            api_field: 'eventStates',
            definition: 'The lifecycle state of an event.',
            values: [
                {
                    value: 'new',
                    description: 'Just created, not yet looked at.',
                },
                {
                    value: 'detected',
                    description: 'Detected but not yet remediated.',
                },
                {
                    value: 'pending',
                    description: 'Awaiting an action or decision.',
                },
                {
                    value: 'remediated',
                    description:
                        'Action was taken (quarantined, deleted, etc.).',
                },
                {
                    value: 'dismissed',
                    description: 'Admin chose to dismiss.',
                },
                {
                    value: 'exception',
                    description:
                        'Matched an Anti-Phishing exception and was allowed through.',
                },
            ],
        },
        {
            term: 'Severity',
            api_field: 'severities',
            definition: 'How serious an event is. Lowercase in the SmartAPI.',
            confusable_with: ['Verdict'],
            disambiguation:
                "See Verdict. Severity is a property of an EVENT; verdict is a property of an ENGINE'S OPINION on an entity.",
            values: [
                {
                    value: 'lowest',
                    description: 'Informational.',
                },
                {
                    value: 'low',
                    description: "Sometimes shown as 'Low' in the HEC UI.",
                },
                {
                    value: 'medium',
                    description: "Sometimes shown as 'Medium' in the HEC UI.",
                },
                {
                    value: 'high',
                    description: "Sometimes shown as 'High' in the HEC UI.",
                },
                {
                    value: 'critical',
                    description:
                        "Sometimes shown as 'Highest' in the HEC UI / older docs. Same value.",
                },
            ],
            note: "The customer-facing API Reference Guide uses capitalized 'Low/Medium/High/Highest' — that documentation is stale. The wire format is lowercase and includes `critical`/`lowest`.",
        },
        {
            term: 'Task',
            definition:
                'An asynchronous job HEC runs in the background (e.g. a bulk action). Has a stable id and a polled status.',
            aliases: ['job'],
        },
        {
            term: 'Task Status',
            api_field: 'status',
            definition: 'Where a task is in its lifecycle.',
            values: [
                {
                    value: 'init',
                    description: 'Created, not yet started.',
                },
                {
                    value: 'inprogress',
                    description: 'Currently running.',
                },
                {
                    value: 'completed',
                    description: 'Finished successfully.',
                },
                {
                    value: 'failed',
                    description: 'Finished with an error.',
                },
                {
                    value: 'stopped',
                    description: 'Cancelled by an operator.',
                },
                {
                    value: 'paused',
                    description: 'Suspended; may resume.',
                },
            ],
        },
        {
            term: 'Scroll ID',
            api_field: 'scrollId',
            definition:
                'Opaque pagination cursor returned by entity and event queries. Pass it back to fetch the next page.',
            aliases: ['scroll_id', 'pagination cursor'],
        },
    ],
};
