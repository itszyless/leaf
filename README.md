<div align="center">

<img src="assets/banner.png" width="680" alt="leaf — Discord bot and web dashboard" />

# leaf

### A little more life in every Discord chat.

A multipurpose Discord bot with a web dashboard for personal settings, themes and economy features.

**AI-Assisted Development · Learning Project · Version 1.1.0**

[Getting started](#run-locally) · [Code guide](docs/CODE_GUIDE.md) · [Privacy](pp.md) · [Terms](tos.md)

</div>

## About

leaf brings utilities, games, virtual economy, profile tools and creative commands into Discord. Its companion website includes a searchable command catalog and a Discord login dashboard for managing preferences, themes and account features.

This is a restored personal project, originally developed on another computer. Version 1.1.0 makes the project easier to install, run and understand. It is a working development codebase, with external integrations and production hosting still requiring operator configuration and testing.

## Latest update

Version 1.1.0 adds separate bot and website startup commands, a safe first-run setup, a clean configuration example and dependency fixes. Command definitions load before Discord connects, so the website can display its catalog in preview mode. Startup failures now stop with an actionable error instead of leaving a partly started bot running.

The update also fixes static-file path containment and dashboard font paths, replaces unsupported policy claims, removes unused assets and keeps credentials and saved user data out of Git. See [the change notes](CHANGELOG.md) for details.

## Features

- **Web dashboard:** Discord OAuth login, command discovery, personal settings, theme creation and sharing, saved themes, rank previews and economy views.
- **Utilities:** notes, reminders, polls, translation, text tools, conversions and lookups.
- **Games and economy:** virtual Cash, banking, upgrades, stock-style games, lotteries, XP and leaderboards.
- **Creative tools:** avatars, banners, image effects and generated Discord-style messages, tweets and comments.
- **AI integrations:** prompt responses, summaries and other provider-dependent features.
- **Community tools:** giveaways, support commands and administrative controls.
- **Optional Plus features:** account entitlements, extra limits and additional commands; payment setup is separate.

The current catalog contains 80 registered command definitions. Some older command files remain as hidden or grouped implementations; the number of files is not the number of registered commands. Service-specific features require their own API credentials and may change when providers change.

## Technology

| Area | Tools |
| --- | --- |
| Runtime | Node.js 24, JavaScript, CommonJS |
| Discord | discord.js 14, slash commands and context menus |
| Web server | Node.js HTTP server, Discord OAuth2 |
| Website | HTML, CSS, browser JavaScript |
| Images | Canvas, @napi-rs/canvas, discord-arts, Jimp |
| Storage | Local JSON files |
| Integrations | Groq, translation, game and media APIs |
| Checks | JavaScript syntax, command serialization and limits, Node.js tests |

## AI-Assisted Development

AI was used extensively as a development assistant, including generating and revising code, debugging errors, reviewing setup and preparing documentation. This project is not presented as entirely hand-written work.

My role included choosing the features, describing the intended behavior, refining prompts, providing feedback, testing results and deciding which changes to keep. Restoring the project also involved checking how generated code behaves outside the computer where it was originally developed.

### What I learned

- **JavaScript and Node.js:** how modules, dependencies, asynchronous functions and startup scripts fit together.
- **Discord development:** how commands, interactions, permissions, intents and bot events connect.
- **Web dashboards:** how a browser interface requests data from a server and reflects account settings.
- **OAuth and credentials:** the difference between a bot token, client secret and user login session, and why private configuration must stay out of Git.
- **Data storage:** how JSON files can support a small project, and why backups, concurrent writes and deletion need more care as it grows.
- **API integration:** why external features need credentials, error handling and realistic expectations about availability.
- **Git and GitHub:** how to restore a project, review changes, write setup instructions and publish without including local data.
- **AI prompting and debugging:** how to divide work into smaller requests and verify generated code through checks and practical testing.

These are areas of growing practical experience, rather than claims of expert knowledge. I am still developing my independent understanding of the generated code.

## Run locally

Install [Node.js 24 LTS](https://nodejs.org/en/download) and [Git](https://git-scm.com/downloads). No separate frontend build tool or database server is required. Use a current patched Node.js 24 release.

```sh
git clone https://github.com/itszyless/leaf.git
cd leaf
npm ci
npm run setup
```

Setup creates a private `config.json`, a random dashboard session secret and empty runtime data files. It does **not** replace existing configuration or saved data. Edit `config.json` locally; never commit or share its credentials.

On Windows PowerShell, use `npm.cmd` instead of `npm` if execution policy blocks `npm.ps1`. You do not need to change the system execution policy.

### Configure Discord

Open your application in the [Discord Developer Portal](https://discord.com/developers/applications).

1. Set `Token` to the application's **bot token**, not a personal Discord account token.
2. Set `Bot_ID` to the application ID and `Owner_ID` to your Discord user ID.
3. Set `Client_Secret` to the OAuth2 client secret if you want dashboard login.
4. Add this exact OAuth2 redirect: `http://localhost:3000/auth/discord/callback`.
5. Enable the **Server Members Intent** and **Message Content Intent** requested by this project. Discord may require approval depending on your application's status.
6. Configure the installation contexts you use. For a server installation, use the `bot` and `applications.commands` scopes with the permissions required by your enabled features. Set `OAuth2` to your generated installation URL if the default user-install link is unsuitable.
7. Add a working `SupportServer` or other private contact route before inviting other users. Optional API keys and webhooks only belong in local configuration.

See Discord's [bot setup guide](https://docs.discord.com/developers/quick-start/getting-started) for portal details.

### Start the bot and website together

```sh
npm start
```

Open **http://localhost:3000**. Leave the terminal running. Press **Ctrl+C** to stop. Starting the bot registers this project's commands globally for the configured Discord application; use a separate development application if you need to preserve another command set.

### Start either one separately

| Command | What starts |
| --- | --- |
| `npm start` | Bot and website in one process |
| `npm run bot` | Bot only |
| `npm run web` | Website preview without a Discord Gateway connection |
| `npm run dev` | Both, restarting when source files change |

Website-only mode shows the public pages and catalog without a bot token. Discord login still requires OAuth credentials and the registered redirect. Live Discord actions require the bot. Run one instance against a data directory; do not run `npm start` alongside another copy on the same port.

## Important files

| File or folder | Purpose |
| --- | --- |
| `index.js` | Selects the startup mode, creates the Discord client and starts the dashboard and background jobs. |
| `config.example.json` | Safe template showing configuration names; real values go in ignored `config.json`. |
| `handlers/registerCommands.js` | Loads command modules and publishes their definitions to Discord. |
| `events/interactionCreate.js` | Receives interactions, checks access and dispatches commands; records usage and XP. |
| `commands/` and the other command folders | Implement slash commands, context actions and Plus features. |
| `dashboard/server.js` | Serves the website, handles OAuth, sessions and dashboard API requests. |
| `dashboard/public/app.js` | Renders pages, forms and client-side navigation. |
| `dashboard/public/styles.css` | Defines the dashboard's visual design. |
| `utils/` | Shared helpers for embeds, language, access, rendering and background work. |
| `data/defaults.json` | Clean initial data; `scripts/setup.js` creates missing runtime files from it. |
| `data/*.json` | Private runtime state, excluded from Git except the clean defaults. Back it up. |

The [code guide](docs/CODE_GUIDE.md) follows a command from Discord through its handler and explains where to make changes.

## Checks

```sh
npm run check
npm test
npm audit
```

The checks validate JavaScript syntax, load and serialize command definitions, check duplicate names and Discord command counts, and test static-file path containment. They do not execute every command or verify every external provider. Browser checks cover the home page, command navigation and policy page at desktop and mobile sizes.

## Hosting and current limits

- GitHub hosts the source; making the repository public does **not** keep the bot online or deploy this Node.js dashboard. GitHub Pages cannot run its server or OAuth backend.
- The local website binds to `127.0.0.1` by default. For hosting, use one persistent Node.js process, persistent storage, an HTTPS reverse proxy and a correctly configured public URL and OAuth redirect. Do not expose a development instance as a production service without reviewing authentication, uploads, external URL fetching and rate limits.
- JSON storage is intended for a small, single-process instance. Multiple writers, large datasets and crash recovery need a database design.
- Dashboard sessions are in memory and are cleared on restart. Full account erasure currently requires operator action.
- API credentials, provider availability, paid Plus checkout and Discord installation settings require operator verification. No successful local check proves every legacy command works end to end.
- Some legacy dependencies are deprecated or have unresolved security advisories. Review `npm audit` before internet-facing deployment; compatibility changes need separate testing.
- The font files and third-party assets retain their owners' terms. Review redistribution and hosting rights for your deployment; see [third-party notes](THIRD_PARTY_NOTICES.md).

Local credentials, saved users, old backups and `node_modules` are excluded from this repository. No license for original leaf code is granted by this README.
