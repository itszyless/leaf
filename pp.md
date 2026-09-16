# Privacy Policy for leaf

Last Updated: September 16, 2026

This policy describes the data behavior of the leaf source code and the instance operated by itszyless. A self-hosted copy is controlled by its own operator. Configuration and enabled commands affect which external services receive data.

## 1. Account and feature data

leaf associates feature data with Discord user IDs. Stored data can include language and display preferences, notes, reminder text, giveaway entries, polls, economy balances, XP, cooldowns, support requests, Plus access and redemption records. Avatar lookup features can save avatar history. Themes and leaderboards can expose the profile or content information needed to display those features.

## 2. Command processing and analytics

leaf processes command inputs and any messages or attachments selected for a command, including translation, AI summaries and image generation. Command analytics store command names, user IDs, context and timestamps, with usage totals. The current messageCreate handler is empty; the project is not a general chat archive.

## 3. Dashboard login and cookies

Discord OAuth requests the identify scope and supplies the user ID, username, display name and avatar. The server exchanges a temporary authorization code with Discord and keeps a signed session identifier in an HttpOnly cookie for up to seven days. Session records are held in memory and end on server restart or logout. The web server and any hosting provider necessarily receive connection metadata such as IP addresses; hosting logs depend on the operator.

## 4. External services

Discord receives bot responses and API requests. AI commands send submitted prompts or selected content to the configured AI provider, including Groq. Translation and lookup commands send the data needed for their requests to their providers. Dashboard image uploads may be sent to 0x0.st, Catbox or Uguu and produce externally accessible URLs. Paste commands may publish text to Pastebin or Rentry. The website loads icon styles from third-party CDNs. Each provider controls its own retention and privacy practices. Do not submit secrets or sensitive material to public upload or paste features.

## 5. Storage and retention

Feature state is stored in local JSON files, rather than an encrypted database. Access depends on the operator’s filesystem and hosting controls. Command event history is pruned by the analytics code during use; other records do not have one universal automatic expiry. Logs, aggregates and backups can have different lifetimes. Removing the Discord app does not automatically erase these files.

## 6. Visibility and support

Public themes, published image or paste URLs, shared responses and leaderboards may be visible to other people. Configured support or error webhooks can send submitted support content or diagnostic details to the operator’s Discord channels. This project does not include an advertising or data-sale integration. Access to local files is controlled by the operator.

## 7. Your choices and requests

Use available settings to control features such as avatar-history visibility, messages and public themes. Contact itszyless privately through the running instance’s support link to request access, correction or deletion and identify the Discord account concerned. The current project has no complete self-service erasure workflow; requests require operator action, including review of logs, related records and backups. Applicable privacy rights remain available.

## 8. Operator responsibilities and updates

A self-hosting operator must supply a working private contact route and explain its hosting location, legal basis, providers and retention arrangements before collecting data from others. This repository does not establish those facts for every deployment. Material changes to this description will update the date above.
