# Hollow Signal

**Community survival coordination for the people living beneath a dead surface.**

Built for the **Life underground** hackathon track, Hollow Signal connects early warnings, fair resource planning, refuge routes, care access, and community check-ins. It models six neighborhoods and 19,000 fictional residents in one sector of the Hollow.

The app works online and can keep working offline after its application cache installs. Its calculations and local records work without an API key or account; sharing between devices uses manually transferred relay files.

## What you can do

| Page | Purpose | Main features |
| --- | --- | --- |
| **Overview** | Understand what is happening in your neighborhood. | Power, air, heat, and water signals; explained warnings; reserve estimates; shortcuts to response planning and aid. |
| **Crisis planner** | Explore how a failure develops and plan the next move. | A 0–120 minute projection, power-allocation comparison, tunnel closures, and refuge routes that account for group size and step-free access. |
| **Share supplies** | Make a transparent plan for limited resources. | Power, water, and food allocations; essential shortfalls; demand coverage; unused supply; downloadable plans. |
| **Health & aid** | Connect community health observations to available support. | Daily respiratory tallies, source and review labels, clinic capacity, supply shortages, care routes, and local-assistance requests. |
| **Community** | Keep people in contact when the network is unreliable. | Call-sign check-ins, incident reports, search, and import/export of shared relay packets. |

The pages work together. A neighborhood on Overview can become the starting point for a refuge or care route. The Crisis planner's clock and tunnel closure also affect aid routes. Travel plans can become check-in drafts, while care plans can become aid requests carried through the same relay.

## Quick start

Use **Node.js 22 or later**. From the repository directory:

```sh
npm start
```

Open **http://127.0.0.1:3000**.

No dependency installation or build step is needed. JavaScript, styles, fonts, and images are included in `dist/`. The development server binds to localhost and serves static files; it does not receive resident records.

## Using the app

The five main tabs have visible labels on desktop, tablet, and phone layouts. Overview includes task shortcuts, and the planning pages provide section jumps.

1. **Inspect a neighborhood.** Choose a power, water, or heat scenario and select a level on Overview. Read the warnings and their causes.
2. **Plan a response.** Use **Plan for this level** to open the Crisis planner. Adjust time, available power, group size, tunnel access, and step-free requirements.
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

Check-ins store a call sign, level, safe/help/moving status, optional message, and timestamp. Updating the same local call sign updates its record. Field reports capture unverified observations about water, power, air, heat, or tunnels; they do not automatically change sensor readings or route closures.

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
| `dist/health.js` | Health signal rules, clinic freshness, aid routing, and validation |
| `dist/health-ui.js` | Health forms, evidence review, clinic updates, and aid requests |
| `dist/relay.js` | Field reports, packet validation, and deterministic merges |
| `dist/styles.css`, `dist/response.css`, `dist/health.css` | Responsive presentation |
| `dist/sw.js` | Versioned offline shell and cache-readiness checks |
| `dist/updates.js` | Update checks and detection of a complete newer offline cache |
| `server.mjs` | Local static server with path isolation |
| `test/` | Model, integration, navigation, relay, server, and offline-asset tests |

## Validation

```sh
npm run check
```

Runs syntax checks and the Node test suite. Coverage includes allocation conservation, crisis projections, inaccessible routes, capacity and stock constraints, health trends, duplicate imports, stale clinic data, legacy packet migration, navigation, and the offline dependency graph.

## Prototype scope

Hollow Signal uses fictional environmental readings, populations, clinic and refuge capacities, and tunnel times. It has no live sensors, validated forecasts, supply-control hardware, reservations, or dispatch service.

Health features support observation and care logistics. They do not diagnose illness, confirm outbreaks, prescribe medication, provide dosing, connect remote clinicians, or deliver treatment. Water scores cannot establish potability, and modeled routes are not real-world safety instructions.

Browser records and exported files are **unencrypted and unauthenticated**. Use aliases and fictional aggregate data. A real deployment would need calibrated sensors, verified routes and capacity, secure communication, reliable transport, and residents' oversight of allocation policy.

## License

[MIT](LICENSE). Bundled DM Sans and Space Grotesk fonts use the SIL Open Font License; see [font licenses](docs/licenses).
