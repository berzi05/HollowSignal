# Hollow Signal

**Community survival coordination for the people living beneath a dead surface.**

Built for the **Life underground** hackathon track, Hollow Signal connects early warnings, fair resource planning, refuge routes, care access, and community check-ins. It models six neighborhoods and 19,000 fictional residents in one sector of the Hollow.

The app works online and can keep working offline after its application cache installs. Its calculations and local records work without an API key or account; sharing between devices uses manually transferred relay files. An optional **Google Gemini response brief** explains a calculated crisis plan and drafts a resident message, with a local brief available when AI is unavailable.

## What you can do

| Page | Purpose | Main features |
| --- | --- | --- |
| **Overview** | Understand what is happening in your neighborhood. | Power, air, heat, and water signals; explained warnings; reserve estimates; shortcuts to response planning and aid. |
| **Crisis planner** | Explore how a failure develops and plan the next move. | A 0–120 minute projection, power-allocation comparison, accessible refuge routes, and AI or local response briefs with sources and resident-message drafts. |
| **Share supplies** | Make a transparent plan for limited resources. | Power, water, and food allocations; essential shortfalls; demand coverage; unused supply; downloadable plans. |
| **Health & aid** | Connect community health observations to available support. | Daily respiratory tallies, source and review labels, clinic capacity, supply shortages, care routes, and local-assistance requests. |
| **Community** | Keep people in contact when the network is unreliable. | Call-sign check-ins, incident reports, search, and import/export of shared relay packets. |

The pages work together. A neighborhood on Overview can become the starting point for a refuge or care route. The Crisis planner's clock and tunnel closure also affect aid routes. Travel plans can become check-in drafts, while care plans can become aid requests carried through the same relay.

## Open and run the app

These instructions work on **Windows, macOS, and Linux**. The app opens in your web browser, with a small local server running on your computer.

### 1. Install Node.js

Install **Node.js 22 or later** from the [official Node.js download page](https://nodejs.org/en/download). The installer includes npm. After installation, open a new terminal and check:

```sh
node --version
npm --version
```

Both commands should print a version number. The Node.js version must be at least `v22`.

### 2. Download the project

**With Git:** install [Git](https://git-scm.com/downloads) if needed, then run these commands in the folder where you want to keep the project:

```sh
git clone --branch main https://github.com/berzi05/HollowSignal.git
cd HollowSignal
```

**Without Git:** open the [GitHub repository](https://github.com/berzi05/HollowSignal), select the `main` branch, and choose **Code → Download ZIP**. Extract the ZIP, then open a terminal in the extracted folder containing `package.json` and `server.mjs`. Its default name is `HollowSignal-main`.

If you already downloaded or cloned the project, open a terminal in that existing project folder. Older copies may still be named `PatriotHackathon`; the folder name does not affect how the app runs.

### 3. Start the server

From the project folder, run:

```sh
npm start
```

The terminal should print:

```text
Hollow Signal: http://127.0.0.1:3000
```

**Keep this terminal open while using the app.** To stop the server, press **Ctrl + C** in that terminal. To start it again later, return to the same project folder and run `npm start`.

No `npm install`, build step, database, API key, or account is required for the core app. JavaScript, styles, fonts, and images are already included in `dist/`. Optional AI setup is described below.

### 4. Open the website

Open **[http://127.0.0.1:3000/](http://127.0.0.1:3000/)** in a browser on the same computer. You should see the Hollow Signal dashboard and five tabs: **Overview**, **Crisis planner**, **Share supplies**, **Health & aid**, and **Community**.

Use this browser address to run the app; double-clicking `dist/index.html` does not run the complete application. The local address works on your own computer. Someone using another computer should follow these setup steps there.

For a first look, select **Explore a blackout**, or open **Health & aid → Load sample health signals**. All sample conditions are fictional.

The server serves the app and an optional AI endpoint. Saved resident records stay in the browser. Only an explicit **Explain with AI** request sends the fictional planner settings to the local server, which calculates the source facts and sends those facts to Google Gemini. After downloading the project and installing Node.js, the core app and local briefs work without an internet connection.

### Get the latest updates

Stop your running server with **Ctrl + C**. If you cloned with Git, run the following from the same project folder:

```sh
git switch main
git pull --ff-only origin main
npm start
```

If you downloaded a ZIP, download and extract the latest `main` ZIP, then run `npm start` from that new folder. Stop the old server first so both copies do not try to use port 3000.

Return to the browser and choose **Check for updates**. When **Reload update** appears, save unfinished forms and click it. If an older page has no update controls, press **Ctrl + Shift + R** on Windows/Linux or **Command + Shift + R** in Chrome/Firefox on macOS.

Updating the app does not require clearing saved records. Keep using the same browser and local address to access them.

### If something does not work

| What you see | What to do |
| --- | --- |
| `node` or `npm` is not recognized | Install Node.js, then close and reopen the terminal before trying again. |
| PowerShell says `npm.ps1` cannot run | Use `npm.cmd start` in the project folder. |
| npm cannot find `package.json` | Enter the project folder containing `package.json` and `server.mjs`, then run `npm start`. |
| `EADDRINUSE` or port 3000 is already in use | Stop the previous server with **Ctrl + C** in its terminal, then retry. |
| The browser cannot connect | Confirm that `npm start` is still running and open the exact address printed by the server. |
| The page still shows an older version | Update the same project folder you run the server from, restart it, and use **Check for updates → Reload update** or a hard refresh. |

## Optional AI response briefs

In **Crisis planner → AI response brief**, choose **Explain with AI** to get a plain-language summary, three explained priorities, and a resident-message draft. A clearly labeled local brief appears immediately and can be read, copied, or downloaded while Gemini works. A successful Gemini answer replaces it and shows the elapsed time. Calculated source facts and warnings accompany both versions. **Copy brief** and **Download brief** include those sources and warnings.

The integration uses the [Gemini Interactions API](https://aistudio.google.com/docs/interactions-overview) and [structured outputs](https://aistudio.google.com/docs/structured-output). The default model is [`gemini-3.5-flash-lite`](https://aistudio.google.com/docs/models/gemini-3.5-flash-lite), with minimal thinking and short output for these calculated-plan explanations. A live request requires internet access, a valid Gemini API key, model access, and available project quota. Usage may incur charges depending on your API tier. The integration uses Node's built-in `fetch`; no SDK installation is required.

### Enable AI locally

1. Create an API key in [Google AI Studio](https://aistudio.google.com/api-keys).
2. In the project folder containing `server.mjs`, copy **`.env.example` to `.env`**. Use your file manager, or `Copy-Item .env.example .env` in PowerShell / `cp .env.example .env` on macOS or Linux. Skip copying if you already have a `.env` file so you preserve its settings.
3. Open `.env` in a text editor and fill in your key:

   ```dotenv
   GEMINI_API_KEY=your_api_key_here
   GEMINI_MODEL=gemini-3.5-flash-lite
   ```

4. Save the file as exactly `.env`, not `.env.txt`. Keep the key out of `dist/`, browser fields, relay files, screenshots, and Git commits. `.env` is ignored by Git; `.env.example` contains no secret.
5. Stop the server with **Ctrl + C**, run **`npm start`** again from this project folder, and open **[http://127.0.0.1:3000/](http://127.0.0.1:3000/)**.
6. Open **Crisis planner → AI response brief**, then select **Check AI connection** and **Explain with AI**. “Configured” only means a key is present; “Gemini responded successfully” and a **Gemini draft** confirm a completed request. A local brief remains explicitly labeled as local.

Existing environment variables take precedence over `.env`. If upgrading from the earlier Gemini setup, change `GEMINI_MODEL` in your existing `.env` to `gemini-3.5-flash-lite`; updating `.env.example` alone does not change your running model. The connection status displays the model loaded by the server. Other Gemini Interactions-compatible models must support structured outputs and a low thinking level; custom models use low thinking instead of the default model's minimal setting. Restart the server after configuration changes. Older OpenAI configuration is no longer read. If the page reports an older AI server, stop that process with **Ctrl + C** and run `npm start` again from the updated folder.

### What AI adds, and what stays calculated

- **Explain the plan:** summarize reserve losses, power-allocation tradeoffs, and the current refuge-access result in plain language.
- **Draft a message:** prepare a short rehearsal update for residents, with review warnings included when copied or downloaded. Nothing is sent automatically.
- **Inspect the evidence:** every priority references one of three calculated facts. AI wording can still misinterpret a fact; review it against the displayed sources.
- **Keep the snapshot current:** changing the scenario, clock, budget, group, origin, accessibility, or closures makes an earlier brief outdated. Copy/download remain disabled until a matching brief is generated; pending answers for changed settings are discarded.
- **Continue without AI:** **Create local brief** uses deterministic rules immediately. Missing keys, network failures, timeouts, and unusable AI responses produce a clearly labeled local brief, never a pretend AI result.

The API accepts only the seven planner settings. The server independently recalculates facts using the same engine as the browser. It does not accept prompts, check-ins, call signs, field reports, health notes, clinic updates, or aid requests. AI cannot modify allocations, invent a usable route in the planner, reserve capacity, prescribe care, or dispatch help.

The key stays on the Node server and is sent to Google in the `x-goog-api-key` header, never in a URL or browser asset. Requests use `store: false`; this is not a promise that the provider retains no data under its own policies. The local endpoint allows one generation at a time and at most five attempts per minute, limits generation to 1,200 output tokens, and reuses successful identical snapshots for five minutes in server memory. The entire provider request, including reading its response, has a 12-second deadline. The browser stops waiting after 14 seconds even if the server stalls, leaving the local brief usable. There are no automatic paid retries. **Stop waiting**, changing the plan, or closing the page cancels the local request; the server aborts its provider connection and releases its request slot. Google may still finish work already received and charge for that usage.

**Static hosting:** `dist/` can still be hosted independently and supports local briefs, but static hosting cannot run the AI endpoint. This implementation intentionally restricts AI access to the computer running Node via localhost. Public AI hosting would need an authenticated backend and per-user usage controls; uploading `.env` or putting the key in frontend JavaScript is not a deployment option.

If AI falls back to a local brief, check that you restarted the correct server after editing `.env`. Access errors indicate a key or project-permission problem; quota errors mean the provider's quota or rate limit was reached. Also check model access and the computer's network connection. Community records and the rest of the app remain usable.

## Using the app

The five main tabs have visible labels on desktop, tablet, and phone layouts. Overview includes task shortcuts, and the planning pages provide section jumps.

1. **Inspect a neighborhood.** Choose a scenario on Overview. Expand a category under **Priority signals** to see every affected neighborhood. Select a reading to inspect the neighborhood, plan aid, or open its field reports.
2. **Plan a response.** Use **Plan for this level** to open the Crisis planner. Adjust time, available power, group size, tunnel access, and step-free requirements. Jump to **AI response brief** for an explained plan and message draft, or use **Create local brief** without AI.
3. **Share supplies.** Open Share supplies to compare power, water, or food allocations and export a plan.
4. **Find care.** Use **Find aid** or open Health & aid. Add a daily tally or choose **Load sample health signals**, then select **Plan aid** beside a neighborhood.
5. **Request assistance.** Review the proposed clinic and route. Choose **Mobile care / local assistance** when people cannot travel. Save the request and track its coordination status.
6. **Carry the signal.** Save a check-in or field report in Community. Export a relay packet, transfer it to another device, and import it there.

**Explore a blackout** starts a preset crisis scenario. All controls are also available independently.

## How the features work

### Early warnings and reserve planning

Overview combines fictional power coverage, battery reserve, oxygen, CO₂, temperature, and water-quality readings. Each warning explains the triggering condition and a suggested community response.

Modeled reserve time is `reserve / (1 - power / 100)` when coverage is below 100%. Full coverage means no reserve draw. The Crisis planner projects up to 120 minutes ahead; after reserves run out, explicit demonstration rules model worsening ventilation and cooling. The assumptions are visible in the planner.

The planner's projected conditions and tunnel closure also apply to care routes. Overview and Share supplies retain the selected scenario's initial snapshot. Health tallies use UTC calendar days, independently of the rehearsal clock.

### Fair resource sharing

Every level receives a proportional essential share first. When supply exceeds that floor, the remainder follows population, vulnerability, and current hazards, capped at each level's modeled demand.

| Resource | Modeled full demand per resident | Essential share |
| --- | --- | --- |
| Power | 0.08 kW | 60% |
| Water | 3 liters per day | Two thirds |
| Food | 1 ration per day | 70% |

The Crisis planner compares this community policy with a fictional policy that fills upper-level demand first. Both receive the same budget. At the preset 1,000 kW budget, deep-level essential coverage is approximately **57%** under upper-level-first allocation and **100%** under community allocation. Lower budgets expose the remaining shortfall.

Allocations show what is assigned, what remains unused, and which needs are unmet. These are planning figures, not supplies delivered or lives saved.

### Refuge routes and accessible movement

Routes account for walking time, modeled hazards, tunnel closures, step-free access, and space for the whole group. The search removes closed or inaccessible connections, rejects destinations with critical readings, and selects the reachable refuge with the lowest weighted travel cost:

`walking minutes × (1 + destination risk score / 100)`

For example, flooding the lower shaft can leave only a stair bypass from L20. Requiring step-free access then produces **No viable candidate** and a help-request draft.

Critical intermediate levels and travel beyond the origin's remaining reserve are flagged. Capacity is a snapshot; a route does not reserve space or certify safe passage.

When no refuge qualifies, or a candidate crosses critical conditions or exceeds the origin's reserve, **Plan local assistance** opens Health & aid with the same neighborhood, group size, and step-free requirement. It selects **Mobile care / local assistance** and keeps the planner's scenario, time, and tunnel closure. Review and save the draft, then export a relay packet to share it; opening the draft does not save a request or dispatch anyone.

### Community health signals

Health & aid compares one reconciled respiratory-symptom tally per neighborhood per UTC day. A tally contains the number reporting symptoms, the number observed, a source, review status, notes, and an update timestamp. It contains no individual medical profile.

The demo flags **at least five reports and a reporting rate at least twice the prior day's rate, with an actual increase**. Comparing rates accounts for changes in the number of people observed. Missing, excluded, old, or future-dated observations remain unknown rather than becoming zero illness. Incomplete days and different sampling groups can still distort the comparison.

Evidence is labeled **Unreviewed**, **Reviewed locally**, or **Excluded**. Reviewing or excluding a tally requires a note. Sources and notes remain inspectable; local review does not authenticate a reporter or confirm an outbreak.

Each neighborhood/date pair has one record. Updating it replaces the tally, and repeated imports do not add its count twice. Reconcile overlapping groups before updating. The latest update wins, with deterministic conflict handling; earlier versions are not retained as an audit history.

**Load sample health signals** adds fictional observations for L20, L16, and L08 without replacing existing tallies. Samples use the current UTC day and naturally age out.

### Care access and aid coordination

Four fictional clinics show open/closed state, available care places, masks, and first-aid kits. Clinic updates include a source and observation time. Submitted snapshots older than six hours or observed in the future are excluded from route candidates. A stale update does not fall back to the seed's availability; untouched seeds remain labeled simulated snapshots.

The aid planner shares the Crisis planner's scenario, projected time, and tunnel closure. It checks access requirements, destination hazards, and availability for the whole group. Care visits require enough care places. Supply plans require enough stock, using one mask or kit per person as a fictional logistics unit, not a treatment recommendation.

When no clinic qualifies, the app offers a local-assistance request. **Mobile care / local assistance** requests help at the origin without suggesting travel.

Saved requests retain the need, group size, proposed clinic and route when available, and planning context. Track **Requested → Coordinating → Reported complete**, then export the update. These are self-reported states; saving a request does not reserve stock, dispatch a team, or confirm delivery.

### Check-ins and community relay

Check-ins store a call sign, level, safe/help/moving status, optional message, and timestamp. Updating the same local call sign updates its record.

Overview previews the three latest field reports. In **Community → Browse field reports**, filter the full log by neighborhood and incident type, or search the observation text. Opening the log from a warning selects its neighborhood and hazard. **Add field report** carries those filters into the form. Reports are unverified observations about water, power, air, heat, or tunnels. The simulator uses its own readings and route settings. **Export full relay packet** includes all saved record types and neighborhoods regardless of the current filters.

Relay packets carry check-ins, field reports, health tallies, clinic snapshots, and aid requests. Import validates the whole packet before accepting changes. Records merge by ID and timestamp, with deterministic conflict handling and a 200-record limit per kind. The merged state must fit the **256 KiB** packet limit.

New exports use **version 2**. Version 1 packets and existing browser records still import without erasing health data; older app versions cannot import version 2.

Someone must carry or send the file to another device. There is no automatic radio mesh, delivery acknowledgment, or emergency dispatch.

## Storage, sharing, and offline use

| Item | Where it lives | How to share it |
| --- | --- | --- |
| Check-ins, incident reports, health tallies, clinic updates, and aid requests | This browser's local storage | Export a relay packet in Community or Health & aid; import it in Community. |
| Resource allocation | Recalculated in memory | **Export plan** in Share supplies. |
| Current care or supply candidate | Recalculated in memory | Save an aid request, then export a relay packet. |
| Crisis projection and refuge route | Recalculated in memory | **Export response brief** in the Crisis planner. |
| Explained brief and resident-message draft | Browser memory; successful AI results also cached for five minutes in server memory | **Copy brief** or **Download brief** in the Crisis planner. These include source facts and warnings. |
| Application assets | Browser service-worker cache | Reload offline after **Offline cache ready** appears. |

A response brief includes the scenario, clock, budget, constraints, assumptions, allocations, and route result. Response briefs and allocation plans are planning documents; they are not importable relay packets.

Offline caching requires a successful first visit on HTTPS or localhost. The availability indicator appears on every page. Local records are not a backup: export what you want to keep. **Clear local data** asks for confirmation before removing records and resetting the scenario.

The app checks for updates when opened, when you return to the tab, and when the connection comes back. **Check for updates** also runs a check immediately. Once a newer offline cache is complete, **Reload update** appears. Save unfinished forms before reloading; records saved in browser storage remain intact.

If an older cached page has no update controls, use **Ctrl + Shift + R** once. For local development, run the server from the checkout you updated: pushing to GitHub does not update other folders on your computer.

## Project structure

| File | Responsibility |
| --- | --- |
| `dist/index.html` | Pages, forms, navigation, and accessible labels |
| `dist/app.js` | Navigation, rendering, local storage, and relay interactions |
| `dist/engine.js` | Scenario readings, risk rules, resource allocation, and check-in validation |
| `dist/crisis.js` | Time projection, policy comparison, route search, and response briefs |
| `dist/response-ui.js` | Planner controls and travel/help drafts |
| `dist/brief.js` | Strict planner-input validation, calculated source facts, local brief, and text export |
| `dist/ai-ui.js`, `dist/ai.css` | AI/local brief interface, cancellation, outdated-snapshot handling, and responsive layout |
| `dist/health.js` | Health signal rules, clinic freshness, aid routing, and validation |
| `dist/health-ui.js` | Health forms, evidence review, clinic updates, and aid requests |
| `dist/relay.js` | Field reports, packet validation, and deterministic merges |
| `dist/styles.css`, `dist/response.css`, `dist/health.css` | Responsive presentation |
| `dist/sw.js` | Versioned offline shell and cache-readiness checks |
| `dist/updates.js` | Update checks and detection of a complete newer offline cache |
| `server.mjs` | Local app server with path isolation and optional `.env` loading |
| `ai.mjs` | Local-only Gemini endpoint, structured output validation, request limits, and in-memory caching |
| `.env.example` | Optional AI configuration template; copy to the untracked `.env` file |
| `test/` | Model, integration, navigation, relay, server, and offline-asset tests |

## Validation

```sh
npm run check
```

Runs syntax checks and the Node test suite. Coverage includes allocation conservation, crisis projections, inaccessible routes, capacity and stock constraints, health trends, duplicate imports, stale clinic data, legacy packet migration, navigation, and the offline dependency graph. AI tests exercise the real local HTTP endpoint with a simulated provider transport: request privacy, origin restrictions, output validation, request limits, timeouts, local fallback, safe text rendering, and outdated-answer rejection. They require no key and make no paid API calls; a live provider connection must be verified separately with your configured key.

## Prototype scope

Hollow Signal uses fictional environmental readings, populations, clinic and refuge capacities, and tunnel times. It has no live sensors, validated forecasts, supply-control hardware, reservations, or dispatch service.

Health features support observation and care logistics. They do not diagnose illness, confirm outbreaks, prescribe medication, provide dosing, connect remote clinicians, or deliver treatment. Water scores cannot establish potability, and modeled routes are not real-world safety instructions.

Browser records and exported files are **unencrypted and unauthenticated**. Use aliases and fictional aggregate data. A real deployment would need calibrated sensors, verified routes and capacity, secure communication, reliable transport, and residents' oversight of allocation policy.

## License

[MIT](LICENSE). Bundled DM Sans and Space Grotesk fonts use the SIL Open Font License; see [font licenses](docs/licenses).
