# Finding your way around leaf

Start with `index.js`. It creates the discord.js client, loads commands and chooses bot, web or combined mode. Once Discord reports the client ready, it registers commands and initializes reminders, giveaways and the lottery. Closing the terminal stops both the bot and dashboard.

## A command's journey

1. `handlers/registerCommands.js` imports the command folders. A module supplies `data` (its Discord command definition) and usually `execute` (its behavior). Hidden modules are skipped.
2. Discord sends an interaction when someone uses a registered command.
3. `events/interactionCreate.js` checks the interaction type and access, tracks usage and invokes the selected command.
4. The command reads its options and calls shared helpers or external services, then replies to Discord.

For a small example, read `commands/ping.js`. For storage, compare `commands/notes.js` and `commands/reminder.js`. `commands/eco.js` is a much larger example with virtual balances and game logic. Many older standalone commands were grouped into broader commands, so look at `hidden` and the registered catalog before adding another command name.

## A dashboard request

The browser first loads `dashboard/public/index.html`, its CSS and `app.js`. The browser code requests `/api/bootstrap` and renders the requested page. `dashboard/server.js` handles API routes and local JSON storage.

For login, the server redirects to Discord, checks the returned OAuth state, exchanges the code and creates a session cookie. The client secret stays on the server. Routes requiring an account read the authenticated session; never trust a user ID supplied by the browser in place of it.

Change page text and browser behavior in `app.js`, layout in `styles.css`, and server-side access or storage behavior in `server.js`. A browser refresh is enough for static files. Restart Node after changing server code, or use `npm run dev` while developing.

## Configuration and data

`config.example.json` documents the structure. `config.json` is the private local copy read by existing modules. Setup only creates missing files; it preserves your original data. Optional providers include Groq, Spotify, TMDB, NightAPI and Fortnite-related lookups. Populate only the services you intend to use.

`data/defaults.json` holds empty initial structures plus static command text collections. `data/*.json` and `agents.json` hold live state and are ignored by Git. Back up those files and `config.json` privately before moving computers or changing storage code. They may contain personal data and keys.

## Editing safely

Use a development Discord application when changing command registration. Run `npm run check` and `npm test`, then try the actual command and dashboard flow. Test with an ordinary account as well as the owner account, because owner permissions can hide access bugs. Confirm any third-party feature against its provider before advertising it as working.
