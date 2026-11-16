# Hollow Signal

**A neighborhood survival console for the people the Hollow leaves in the dark.**

Built for **Life underground**, a dystopian hackathon track set beneath an unlivable surface. Hollow Signal connects four decisions: **where systems may fail, how scarce supplies should be shared, which refuge routes remain usable, and who still needs help**.

The project is a working, browser-based prototype with synthetic data. It does not connect to real sensors, emergency services, or radio hardware.

[Open the private demo](https://hollow-signal-berzi05.indigo-pin-3384.chatgpt.site) · Owner sign-in required. For judges or teammates, run the app locally using the instructions below.

## The idea

When the Directorate cuts power, a deeper neighborhood loses more than light: ventilation slows, water treatment fails, and families lose contact. Separate dashboards miss that chain of events. Hollow Signal gives a neighborhood coordinator one place to understand it and act.

| Hackathon challenge | What the prototype does |
| --- | --- |
| **1 — Blackout and air warnings** | Scores conditions across six levels, explains contributing risks, and estimates reserve time from the simulated readings. |
| **2 — Fair rationing** | Calculates allocations for power, water, or food with an essential floor and explicit needs weighting. |
| **3 — Dangerous heat** | Surfaces heat and ventilation problems alongside power conditions. |
| **4 — Unsafe water** | Flags simulated water-quality failures and gives an action to investigate. |
| **5 — Tunnel access** | Reroutes around a flooded shaft and respects step-free requirements; no route is returned when constraints cannot be met. |
| **6 — Overcrowding** | Checks that a refuge has modeled capacity for the whole traveling group. |
| **7 — Communication during shutdowns** | Caches the application and supports manual JSON transfer of locally recorded information. |
| **8 — Family separation** | Records resident check-ins with location and safe, moving, or help-needed status. |

## Try it locally

Requires **Node.js 22 or newer**. There are no application dependencies to install.

```sh
git clone https://github.com/berzi05/PatriotHackathon.git
cd PatriotHackathon
npm start
```

Open the localhost URL printed by the server. The app is served from `dist/`; any static host can serve that directory. Use localhost or HTTPS for service-worker support.

```sh
npm test       # Domain-engine, relay, and static-server tests
npm run check  # Project checks
```

## A short demo

1. Open **Overview** and select a deep level in **The pulse of Sector 07**. Read the reasons behind its warning.
2. In **Situation simulator**, change **Current conditions** to **Geothermal outage**, **Recycler contamination**, or **Cooling system failure**. Watch affected levels and recommended actions change.
3. Open **Resource allocation**, select a resource, and reduce **Available supply**. Compare each level's allocation and demand coverage. Use **Export plan** to save the result.
4. Open **Community relay**, enter a fictional call sign, level, and status, then select **Save my check-in**. Reload the page to see that local state persists.
5. Use **Report an incident** to add an unverified field observation. In **Community relay**, select **Export** to save a JSON packet of check-ins and reports, then **Import** that file in another browser. This demonstrates manual transfer when central networking is unavailable.

See [the 90-second pitch and demo script](docs/DEMO.md) for a judging walkthrough.

## Response Lab: a connected blackout drill

Select **Start the blackout drill** on Overview for a three-step walkthrough: trip the plant, close the lower shaft, and prepare a family signal. The new **Response lab** view connects a 0–120 minute fictional cascade, an allocation-policy comparison using the same power budget, and refuge routing with closure, capacity, and step-free constraints.

At the default 1,000 kW demonstration budget, the upper-level-first comparison covers about 57% of deep-level essential demand; the community allocation covers 100%. These are calculated shares of fictional requirements, not claims about lives saved. Lower the budget to see the shortfall honestly.

The route planner can return **no viable candidate**. With the lower shaft closed, a step-free journey from L20 is unavailable; the app prepares a help-request draft instead of inventing an accessible route. A route never reserves capacity or dispatches responders.

**Export response brief** downloads the scenario, clock, budget, constraints, assumptions, allocations, and route. This planning document is separate from the importable Community relay packet. The rehearsal clock affects the Response Lab; Overview and Resource allocation retain the initial snapshot of the selected scenario.

New modules: `dist/crisis.js` (pure model), `dist/response-ui.js` (interactive lab), and `dist/response.css`. Tests cover budget conservation, cascading changes, rerouting, accessibility, capacity, UI interactions, and the complete offline dependency graph. See [the 90-second presentation](docs/DEMO.md).

## How it works

The app is deliberately small enough to serve from a neighborhood computer. Static HTML, CSS, and native JavaScript modules run the interface; a deterministic engine owns the simulation and allocation rules. No API key, account, cloud backend, or build step is required.

```text
Synthetic level readings → Risk assessment → Explained warnings
Population + need + supply → Allocation engine → Reviewable supply plan
Resident input → Browser storage → JSON export → Manual transfer → Import
```

| File | Responsibility |
| --- | --- |
| `dist/index.html` | Application shell and accessible page structure |
| `dist/styles.css` | Responsive visual design |
| `dist/app.js` | Interface, local persistence, and transfer interactions |
| `dist/engine.js` | Scenario data, risk rules, allocation, and check-in validation |
| `dist/relay.js` | Field reports, packet validation, and deterministic merging |
| `dist/crisis.js` | Time projection, policy comparison, refuge routing, and response briefs |
| `dist/response-ui.js` | Guided drill, interactive comparisons, and travel/help drafts |
| `dist/response.css` | Responsive Response Lab presentation |
| `dist/sw.js` | Application cache for subsequent offline visits |
| `test/engine.test.js` | Deterministic behavior and edge-case tests |
| `test/relay.test.js` | Packet validation, report handling, and merge tests |
| `test/server.test.js` | Static-server behavior and path isolation tests |
| `test/sw.test.js` | Service-worker install, cache status, activation, and fetch tests |
| `server.mjs` | Local static development server |

### Risk assessment

Warnings are rule-based and explainable. They combine simulated power, reserve, air, temperature, and water readings. A warning is a prompt to investigate, not a calibrated forecast or proof that water or air is safe. The scenarios are reproducible, so a judge can see exactly which changed conditions cause a warning.

| Reading | Watch | Critical |
| --- | --- | --- |
| Power supply coverage | Below 70% | Below 40% |
| Oxygen | Below 20% | Below 19.5% |
| CO₂ | At least 1,500 ppm | At least 5,000 ppm |
| Temperature | At least 30°C | At least 34°C |
| Synthetic water-quality index | Below 80/100 | Below 60/100 |

These are illustrative demo rules, not validated operating limits. Reserve time is modeled as `reserve / (1 - power / 100)` when supply coverage is below 100%, where reserve is the stored energy expressed as minutes of full essential demand. This assumes a constant shortfall; it is not a forecast of when a plant will fail.

### Fair allocation

The allocator first accounts for essential needs. If the available supply cannot cover that floor, each level receives a proportional share of its essential requirement and the plan reports the shortfall. Remaining supply is distributed against unmet demand using explicit needs weighting, without exceeding a level's modeled demand. The plan preserves the supplied budget and exposes coverage so a coordinator can review the tradeoffs.

| Resource | Modeled demand per person | Essential share of demand |
| --- | --- | --- |
| Power | 0.08 kW, instantaneous | 60% |
| Water | 3 liters per day | Two thirds |
| Food | 1 ration per day | 70% |

For supply above the essential floor, the weight is `population × (1 + 1.5 × vulnerable fraction + 0.5 × risk score / 100)`. Capped weighted allocation redistributes any surplus from a fully supplied level to levels with remaining demand. Amounts are quantized to 0.001 units. These are hackathon assumptions; the modeled water demand, for example, does not represent complete domestic and sanitation needs.

This is a transparent policy prototype, not a claim that one formula settles fairness. Residents should be able to inspect, challenge, and change the assumptions before a real deployment.

### Offline behavior

After a successful initial visit and cache installation, the service worker can serve the app without a connection. Look for **Offline cache ready** before relying on a cached visit; some hosting or browser configurations may prevent caching. Records persist in that browser's local storage. JSON export/import demonstrates a store-and-forward workflow: a person must actually carry or send the file to another device.

Submitting another check-in under the same call sign updates its existing local record. Imported check-ins and reports are validated and merged by record ID; the newest timestamp wins, with deterministic handling of ties. Separate devices can create different IDs for the same call sign. This bounds duplicate records but does not verify who created them or whether a device's clock is correct.

Field reports remain unverified observations. They appear in **Community field reports** and travel in relay packets; they do not automatically change sensor readings or risk scores. An exported allocation plan is a separate JSON document and cannot be imported as a relay packet.

**There is no built-in mesh network, Bluetooth transport, automatic cross-device sync, or guaranteed message delivery.** A browser saying it has a network connection does not establish that another resident received a check-in. Cache availability also depends on browser support and storage retention.

## Limits and responsible next steps

- All readings, population counts, thresholds, and incidents in the starting demo are fictional. No forecast accuracy or field safety has been established.
- The prototype does not provide medical diagnosis, certify drinking water, operate life-support equipment, or dispatch help.
- Browser records and exported files are not encrypted. Use aliases and fictional details in demos. Do not store sensitive resident health or identity information.
- Local storage is not a backup. Clearing browser data, storage eviction, or losing a device can lose records. Imported records are not authenticated evidence.
- Real deployment needs validated sensors, signed observations, authenticated and encrypted transport, delivery acknowledgments, auditability, accessibility testing, and resident oversight of resource policy.

## Where this could go

1. Connect calibrated sensor gateways and display freshness, provenance, confidence, and device health for each reading.
2. Add a tested neighborhood transport layer using appropriate local-network or radio gateways, with encrypted messages, deduplication, and delivery acknowledgments.
3. Pilot the resource policy with residents and model critical facilities, reserve stocks, distribution losses, and transport constraints.
4. Add clinic and shelter capacity without exposing individual medical histories.
5. Use verified environmental observations to support later surface exploration planning.

## License

[MIT](LICENSE). Bundled DM Sans and Space Grotesk fonts use the SIL Open Font License; see [font licenses](docs/licenses).
