# Hollow Signal — 90-second presentation

## The one sentence

**A community crisis-response tool that connects a blackout warning to a fair allocation, a usable refuge route, and a family signal — even when the central network is cut.**

Keep the scope on sustaining life underground. The contrast is between two explicit allocation policies, not a claim that fictional data proves a real policy saves lives.

## Before the demo

1. Run `npm start` with Node 22 or later and open the printed address.
2. Let the app load fully. Check **Offline cache ready** while the browser sidebar is visible. For a disconnected demonstration, use browser DevTools Network → Offline after the cache is ready; reload and rehearse once.
3. Use a separate browser profile with no personal records. Use the fictional call sign **Lantern-17**.
4. Start on Overview. Keep the screen at a size where the comparison and route are easy to show; zoom only if necessary.
5. If demonstrating transfer, keep a second browser profile ready. Export/import is manual; no automatic mesh or delivery is claimed.

## The script

| Time | Say | Do |
| --- | --- | --- |
| 0–10s | “In the Hollow, your depth decides whether you get light, air, and help. A blackout is the start of several failures. Hollow Signal connects the decisions a neighborhood has to make next.” | Show Overview; select **Start the blackout drill**. |
| 10–25s | “This is a fictional plant failure. The Sump has about seven modeled minutes of reserve. Advancing the clock shows how power loss cascades into ventilation and cooling.” | Show the reserve clock. Select **Close the lower shaft** to advance 20 minutes and flood that connection. |
| 25–45s | “We have the same 1,000 kW under either policy. Filling upper levels first covers 57% of deep-level essentials. Our essentials-first policy covers 100%. You can inspect the formula, or lower the budget and see the unavoidable shortfall.” | Point to **Deep-level essential coverage** and the paired bars. Keep supply at 1,000 for the headline comparison. |
| 45–65s | “A closed tunnel changes the response. The planner finds the service stairs and checks room for the group. But someone using a wheelchair cannot take those stairs.” | Scroll to the route; enable **Need a step-free route**. Show **No viable candidate** and the explicit request for assistance. |
| 65–82s | “Now the network goes down. This help request can still become a local family signal. Someone carries the exported packet to the next connected neighborhood.” | Select **Draft a help request**, enter **Lantern-17**, and save. Export the relay packet. If time permits, show import in the second profile. |
| 82–90s | “Our prototype connects warning, fairness, movement, and reconnection. Its assumptions are visible, its decisions are tested, and the people deepest underground are part of every plan.” | End on the saved signal. |

For a shorter demonstration, skip the supply-slider adjustment and second-profile import. Do not claim a successful cross-device delivery unless you actually demonstrate it.

## What works

- The time slider recalculates remaining reserves and a declared cascade model.
- Policy comparison recomputes six allocations from the same budget and current hazards.
- The route search respects closures, step-free access, group capacity, and destination hazards.
- A missing route produces a help-request draft; the tool does not silently ignore a wheelchair requirement.
- The response brief exports exact inputs, assumptions, allocation, and routing output.
- A draft becomes a local record only after the resident saves it. Existing relay export/import transports that record manually.
- The complete application graph, including the response lab, is in the offline shell.

## Likely questions

**Why offline?** It runs normally online. Caching and local records keep core decisions available when the Directorate-controlled network fails. The prototype's transport is manual files, not a radio mesh.

**Is the seven-minute window a real prediction?** No. All readings and cascade rates are fictional. The calculator makes those assumptions explicit so a judge can change inputs and see reproducible consequences.

**Does 100% coverage mean everyone survives?** No. It means the modeled essential power requirement of each level is covered at that budget. It does not prove health outcomes, delivered electricity, or real infrastructure readiness.

**How is the route chosen?** Dijkstra search minimizes walking minutes weighted by the destination node's hazard score. It removes closed/inaccessible edges and filters refuges by group capacity and critical destination readings. Critical intermediate levels and a travel time longer than origin reserve are flagged. A route is a candidate for local review, not a safety clearance.

**What changes the other pages?** The drill selects the same scenario used by Overview and Resource allocation. The rehearsal clock only projects the Response Lab; the other pages retain the scenario's initial snapshot. The route drafts a real Community relay form without automatically saving it.

**What is still a prototype?** Synthetic sensors, fictional tunnel times, simulated capacity, and a proposed allocation policy. There are no verified sensors, automatic supply control, refuge reservations, encrypted/authenticated delivery, or emergency dispatch.

## Next work after the hackathon

Validate the model with infrastructure experts; add timestamped sensor provenance and occupied-capacity updates; authenticate and encrypt relay packets; test an actual neighborhood transport and acknowledgments; involve residents in allocation governance.
