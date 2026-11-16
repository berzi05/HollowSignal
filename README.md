# Hollow Signal

**A browser app that helps an underground neighborhood understand a crisis, share limited supplies, find a refuge route, and keep people in contact.**

Built for the **Life underground** track. The app models one sector of the Hollow: six neighborhoods and 19,000 fictional residents. It runs online normally and can keep working offline after its application cache has installed.

## What the app actually does

| Page | What you can do | What the app gives you |
| --- | --- | --- |
| **Overview** | Choose a power, water, or heat scenario; select a neighborhood. | Population-weighted conditions, explained warnings, modeled reserve time, and a **Plan for this level** action. |
| **Crisis planner** | Advance the clock, change the power budget, select a starting level and group size, close a tunnel, or require step-free access. | Projected conditions, a side-by-side allocation comparison, and a candidate refuge route with time, capacity, and hazard warnings. |
| **Share supplies** | Choose power, water, or food and set the available amount. | Per-level allocations, essential shortfalls, coverage, unused supply, the policy formula, and a downloadable plan. |
| **Community** | Save a call-sign check-in, search for someone, record a field observation, or import/export a relay packet. | Persistent local records and a way to carry updates manually between devices. |

The planner connects to the rest of the app. Choosing **Plan for L20**, for example, opens the planner with L20 as the route origin. A candidate route can prepare a travel check-in. If no route meets the access and capacity constraints, it prepares a help request instead. You review the draft and save it yourself.

## Start the app

Use **Node.js 22 or later**. From the repository directory:

```sh
npm start
```

Open **http://127.0.0.1:3000**. No API key, account, dependency installation, or build step is needed. All JavaScript, styles, fonts, and images are included in `dist/`.

The development server binds to localhost by default. It serves static assets; it does not receive resident records.

## Find what you need

The four main tabs have visible text labels on desktop, tablet, and phone layouts. Overview also has direct shortcuts for planning, supplies, and community signals.

1. **Understand a problem:** choose a situation and inspect a level on Overview. The details explain which readings caused each warning.
2. **Plan for that neighborhood:** use **Plan for this level**. In the Crisis planner, jump straight to **Reserves**, **Power allocation**, or **Refuge route**.
3. **Check whether everyone can travel:** set the group size, mark a flooded shaft, and select **Need a step-free route** when appropriate. The planner either gives a candidate with explicit warnings or says no candidate meets the constraints.
4. **Leave a signal:** choose **Draft a travel check-in** or **Draft a help request**, enter a call sign, review the message, and save. Export a relay packet to share the saved record.
5. **Plan other supplies:** open Share supplies for water or food. Adjust the amount and export the allocation if you need a portable record.

**Explore a blackout** is a shortcut to a preset scenario. You can also use every control directly.

## How the useful parts work

### Warnings and reserve time

The Overview combines simulated power coverage, battery reserve, oxygen, CO₂, temperature, and water-quality readings. Rule-based warnings include an explanation and a suggested community response.

Reserve time is calculated as `reserve / (1 - power / 100)` when supply coverage is below 100%. Full coverage means no modeled reserve draw.

The Crisis planner projects 0–120 minutes from the selected scenario. Once reserve power is exhausted, the model increases ventilation and cooling problems using rates shown in **Show the model, the limits, and what gets exported**.

**The planner clock changes the projection in the planner only.** Overview and Share supplies retain the initial snapshot of the selected scenario.

### Resource sharing

The community allocation gives every level a proportional essential share first. When supply exceeds that floor, remaining supply follows population, vulnerability, and current hazards, capped at each level's modeled demand.

| Resource | Modeled full demand per resident | Essential share |
| --- | --- | --- |
| Power | 0.08 kW | 60% |
| Water | 3 liters per day | Two thirds |
| Food | 1 ration per day | 70% |

The planner compares power allocation against a fictional policy that fills upper levels first. Both policies use exactly the same budget.

For example, at the preset 1,000 kW budget, upper-level-first allocation covers about **57%** of deep-level essential demand; the community policy covers **100%**. Reducing the budget makes the shortfall visible. These percentages describe fictional planning requirements, not lives saved or supplies actually delivered.

### Refuge routing

The route search considers tunnel walking times, current modeled hazards, closures, step-free access, and space for the entire group.

It removes closed or inaccessible connections, rejects critical destination readings, and chooses the reachable refuge with the lowest modeled travel cost: `walking minutes × (1 + destination risk score / 100)`.

A flooded lower shaft can leave only a stair bypass from L20. Requiring a step-free route then produces **No viable candidate**. The app never silently drops the access requirement.

Critical intermediate levels and travel longer than the origin's remaining reserve are flagged. Capacity is a fictional snapshot; the route does not reserve space or certify safe passage.

### Check-ins, reports, and manual relay

- A check-in stores a call sign, level, safe/help/moving status, optional message, and timestamp.
- Updating the same local call sign updates its record.
- Field reports store unverified observations about water, power, air, heat, or tunnels. They do not automatically alter sensor readings or close a route.
- Import validates the whole packet before accepting changes. Records merge by ID and timestamp, with deterministic conflict handling and a 200-record limit per kind.
- Export/import is manual: someone must carry or send the file. There is no automatic radio mesh, delivery acknowledgment, or emergency dispatch.

## What is saved or exported

| Item | Where it lives | How to share it |
| --- | --- | --- |
| Saved check-ins and incident reports | This browser's local storage | Export/import a **relay packet** in Community. |
| Resource allocation | Recalculated in memory | Use **Export plan** in Share supplies. |
| Crisis projection and route | Recalculated in memory | Use **Export response brief** in the Crisis planner. |
| Application assets | Browser service-worker cache after installation | Reload offline after **Offline cache ready** appears. |

A response brief contains the exact scenario, clock, budget, route constraints, assumptions, allocations, and route result. It and an allocation plan are planning documents; neither is an importable relay packet.

The availability indicator is visible on every page, including mobile. Offline caching needs a successful first visit on HTTPS or localhost. Local records are not a backup. **Clear local data** asks for confirmation before removing records and resetting the scenario.

## Project structure

| File | Responsibility |
| --- | --- |
| `dist/index.html` | Application pages, forms, navigation, and accessible labels |
| `dist/app.js` | Navigation, rendering, local storage, and relay interactions |
| `dist/engine.js` | Scenario readings, risk rules, resource allocation, and check-in validation |
| `dist/crisis.js` | Time projection, policy comparison, constrained route search, and response briefs |
| `dist/response-ui.js` | Planner controls and travel/help drafts |
| `dist/relay.js` | Field reports, packet validation, and deterministic merges |
| `dist/styles.css`, `dist/response.css` | Responsive presentation |
| `dist/sw.js` | Versioned offline shell and cache-readiness checks |
| `server.mjs` | Local static server with path isolation |
| `test/` | Model, navigation, integration, relay, server, and offline-asset tests |

## Check the code

```sh
npm run check
```

This runs syntax checks and the Node test suite. Tests cover allocation conservation, cascade behavior, blocked and inaccessible routes, refuge capacity, planner-to-check-in integration, browser-history handling, import validation, and the offline dependency graph.

## Scope and limits

This is a functional prototype using fictional environmental data, populations, capacities, and tunnel times. It has no live sensors, validated forecasts, supply-control hardware, refuge reservations, medical diagnosis, or dispatch service.

The app's warnings and routes support exploring a scenario; they are not real-world safety instructions. Water scores do not establish potability. Browser records and exported files are not encrypted or authenticated; use aliases and fictional details.

A real deployment needs calibrated sensors, current capacity data, verified routes, secure messaging, reliable transport, and residents' oversight of allocation policy.

## License

[MIT](LICENSE). Bundled DM Sans and Space Grotesk fonts use the SIL Open Font License; see [font licenses](docs/licenses).
