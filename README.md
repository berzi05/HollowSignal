# Hollow Signal

**A browser app that helps an underground neighborhood understand a crisis, share limited supplies, find refuge or care, and keep people in contact.**

Built for the **Life underground** track. The app models one sector of the Hollow: six neighborhoods and 19,000 fictional residents. It runs online normally and can keep working offline after its application cache has installed.

## What the app actually does

| Page | What you can do | What the app gives you |
| --- | --- | --- |
| **Overview** | Choose a power, water, or heat scenario; select a neighborhood. | Population-weighted conditions, explained warnings, modeled reserve time, and a **Plan for this level** action. |
| **Crisis planner** | Advance the clock, change the power budget, select a starting level and group size, close a tunnel, or require step-free access. | Projected conditions, a side-by-side allocation comparison, and a candidate refuge route with time, capacity, and hazard warnings. |
| **Share supplies** | Choose power, water, or food and set the available amount. | Per-level allocations, essential shortfalls, coverage, unused supply, the policy formula, and a downloadable plan. |
| **Health & aid** | Record or review daily respiratory tallies, update clinic capacity and stock, plan access to care, and save aid requests. | Explained increases, source and review labels, clinic shortages, constrained care/supply routes, and portable requests for local assistance. |
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

The five main tabs have visible text labels on desktop, tablet, and phone layouts. Overview also has direct shortcuts for planning, supplies, health, and community signals. A selected neighborhood has both **Plan for this level** and **Find aid** actions.

1. **Understand a problem:** choose a situation and inspect a level on Overview. The details explain which readings caused each warning.
2. **Plan for that neighborhood:** use **Plan for this level**. In the Crisis planner, jump straight to **Reserves**, **Power allocation**, or **Refuge route**.
3. **Check whether everyone can travel:** set the group size, mark a flooded shaft, and select **Need a step-free route** when appropriate. The planner either gives a candidate with explicit warnings or says no candidate meets the constraints.
4. **Leave a signal:** choose **Draft a travel check-in** or **Draft a help request**, enter a call sign, review the message, and save. Export a relay packet to share the saved record.
5. **Plan other supplies:** open Share supplies for water or food. Adjust the amount and export the allocation if you need a portable record.

6. **Find care or request assistance:** open **Health & aid**. Load sample signals or add a daily tally, select **Plan aid** beside a neighborhood, then review the clinic route. Choose **Mobile care / local assistance** if people cannot travel. Save the request and export a relay packet.

**Explore a blackout** is a shortcut to a preset scenario. You can also use every control directly.

## How the useful parts work

### Warnings and reserve time

The Overview combines simulated power coverage, battery reserve, oxygen, CO₂, temperature, and water-quality readings. Rule-based warnings include an explanation and a suggested community response.

Reserve time is calculated as `reserve / (1 - power / 100)` when supply coverage is below 100%. Full coverage means no modeled reserve draw.

The Crisis planner projects 0–120 minutes from the selected scenario. Once reserve power is exhausted, the model increases ventilation and cooling problems using rates shown in **Show the model, the limits, and what gets exported**.

**The Crisis planner clock and tunnel closure also apply to Health & aid routes.** Overview and Share supplies retain the initial snapshot of the selected scenario. Health tallies use actual UTC calendar days, independently of the fictional rehearsal clock.

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

### Community health signals — question 9

Health & aid compares one reconciled respiratory-symptom tally per neighborhood per UTC day. Each tally records the number reporting symptoms, the number observed, its source, a review state, notes, and an update timestamp. It stores no individual medical profiles.

The transparent **demo review rule** flags at least five reports with a reporting rate at least twice the previous day's rate and an actual increase. Comparing rates avoids flagging an increase caused only by observing more people. A zero baseline is handled without dividing by zero; missing, excluded, old, or future-dated observations do not become zero illness. Incomplete days and different sampling groups can still distort comparisons. This is an attention signal, not a validated outbreak detector or an estimate of population prevalence.

**Unreviewed**, **Reviewed locally**, and **Excluded** are separate evidence states. Reviewing requires a note and does not confirm disease or authenticate the reviewer. The evidence drawer exposes sources, dates, and notes. One stable record ID per level and day prevents repeated relay imports from adding the same count twice; correct a daily total rather than adding overlapping groups. The latest update wins, with deterministic conflict handling. Earlier versions are not an audit history.

**Load sample health signals** adds fictional L20, L16, and L08 observations without replacing existing tallies. L20 starts at 4/80 on the prior day and 18/80 today, giving a clear signal to review. Sample dates use the current UTC day; saved samples naturally age out.

### Care access and supply coordination — question 10

Four fictional clinics show open/closed state, available care places, masks, and first-aid kits. Update a snapshot with its source and observation time. Submitted snapshots older than six hours or observed in the future are excluded from route candidates; a stale update never silently falls back to the seed's availability. Untouched seeds remain explicitly labeled simulated snapshots.

The aid planner uses the Crisis planner's current scenario, projected time, and tunnel closure. It checks the whole group's needs, step-free access, destination hazards, and the lowest weighted route cost. A care visit requires sufficient care places. A supply request requires sufficient stock, using one mask or kit per person as a fictional logistics unit, not clinical guidance. Critical intermediate levels and travel beyond reserve time remain visible warnings.

If no clinic qualifies, the app offers a local-assistance request. **Mobile care / local assistance** explicitly requests help at the origin without suggesting travel. Saved requests retain their need, group size, proposed clinic/route, scenario, rehearsal time, access constraints, and closure. Track **Requested → Coordinating → Reported complete**, then relay the status update. These are self-reported coordination states, not dispatch or delivery confirmations. Planning and saving never consume or reserve inventory.

This addresses the **logistics portion of question 10**: locating care and supplies and coordinating assistance for people who cannot reach it. It does not provide diagnosis, prescriptions, medication dosing, remote clinicians, or actual treatment.

### Check-ins, reports, and manual relay

- A check-in stores a call sign, level, safe/help/moving status, optional message, and timestamp.
- Updating the same local call sign updates its record.
- Field reports store unverified observations about water, power, air, heat, or tunnels. They do not automatically alter sensor readings or close a route.
- Import validates the whole packet before accepting changes. Records merge by ID and timestamp, with deterministic conflict handling and a 200-record limit per kind.
- New exports use relay **version 2**, including health tallies, clinic snapshots, and aid requests. Version 1 packets and existing browser records still import without erasing health data. Older app versions cannot import version 2. The whole merged state must fit the 256 KiB packet limit before any data is accepted.
- Export/import is manual: someone must carry or send the file. There is no automatic radio mesh, delivery acknowledgment, or emergency dispatch.

## What is saved or exported

| Item | Where it lives | How to share it |
| --- | --- | --- |
| Saved check-ins, incident reports, health tallies, clinic updates, and aid requests | This browser's local storage | Export/import a **relay packet** in Community. |
| Resource allocation | Recalculated in memory | Use **Export plan** in Share supplies. |
| Current care/supply candidate | Recalculated in memory | Save an **aid request**, then export a relay packet in Health & aid or Community. |
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
| `dist/health.js` | Daily health signal rules, clinic freshness, aid routing, and record validation |
| `dist/health-ui.js` | Health forms, evidence review, clinic snapshots, and the aid queue |
| `dist/relay.js` | Field reports, packet validation, and deterministic merges |
| `dist/styles.css`, `dist/response.css`, `dist/health.css` | Responsive presentation |
| `dist/sw.js` | Versioned offline shell and cache-readiness checks |
| `server.mjs` | Local static server with path isolation |
| `test/` | Model, navigation, integration, relay, server, and offline-asset tests |

## Check the code

```sh
npm run check
```

This runs syntax checks and the Node test suite. Tests cover allocation conservation, cascade behavior, blocked and inaccessible routes, refuge capacity, planner-to-check-in integration, browser-history handling, rate comparisons, tally deduplication, clinic freshness and stock, care access constraints, health-to-aid integration, legacy packet migration, atomic import validation, and the offline dependency graph.

## Scope and limits

This is a functional prototype using fictional environmental data, populations, capacities, and tunnel times. It has no live sensors, validated forecasts, supply-control hardware, refuge reservations, medical diagnosis, or dispatch service.

The app's warnings and routes support exploring a scenario; they are not real-world safety instructions. Water scores do not establish potability. Browser records and exported files are not encrypted or authenticated; use aliases and fictional details.

A real deployment needs calibrated sensors, current capacity data, verified routes, secure messaging, reliable transport, and residents' oversight of allocation policy.

## License

[MIT](LICENSE). Bundled DM Sans and Space Grotesk fonts use the SIL Open Font License; see [font licenses](docs/licenses).
