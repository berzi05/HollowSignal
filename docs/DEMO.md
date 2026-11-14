# Hollow Signal: 90-second demo

## Before presenting

- Start the app with `npm start` and open the printed localhost URL.
- Use fictional resident details. Keep a second browser profile available if demonstrating file transfer.
- In **Situation simulator**, start with **Current conditions**. Check that the application has loaded and the offline cache is ready before attempting an offline demonstration.
- Use **Export** in **Community relay** for transferable records. **Export plan** produces a separate allocation document, not an importable relay packet.
- Acknowledge that the starting readings are simulated. The point of the demo is a working decision flow, not claimed sensor accuracy.

## The script

| Time | Say | Show |
| --- | --- | --- |
| **0–15s** | “In the Hollow, a power cut is also an air, water, and communication crisis. The deepest levels are hit first. Hollow Signal gives their neighborhood coordinators one shared picture.” | **Overview**, **The pulse of Sector 07**, and **Priority signals**. |
| **15–35s** | “Here is a simulated blackout. We can see which levels lose their margin, what changed, and what action the coordinator should consider.” | In **Situation simulator**, select **Geothermal outage**, then select a deep level and read its warning details. |
| **35–55s** | “Knowing who is in danger is only the first step. With less supply than demand, the planner protects essential needs first, makes shortfalls visible, and explains how the remaining supply is shared.” | Open **Resource allocation**, reduce **Available supply**, and compare allocations across levels. |
| **55–75s** | “When the central network fails, residents still need to leave a signal. This check-in stays on the device, and an exported file can be carried to another neighborhood.” | Open **Community relay**, enter a fictional call sign and select **Save my check-in**. Reload to show persistence, then select **Export**. If time permits, **Import** the file in the second browser. |
| **75–90s** | “This prototype connects warning, fair distribution, and family check-ins. The next step is validated sensors and a secure transport layer. The people furthest underground should still be seen.” | Return to the overview. End on the affected neighborhood. |

## If a judge asks

**Is it really offline?**

The static application can work from its installed service-worker cache after an initial successful load. Local records stay in the current browser. Export/import carries check-ins and incident reports without a central service, but someone must move the file between devices. The prototype has no radio mesh or automatic cross-device delivery.

**Do field reports change the risk score?**

No. They are stored, displayed, and carried as unverified observations. The risk engine uses the simulated environmental readings. A real system would need a verification process before treating a resident report as a confirmed measurement.

**Is the forecast AI?**

No. The prototype uses deterministic, inspectable rules over synthetic readings. That makes its assumptions easy to demonstrate and test. Any future forecasting model would need calibrated data, uncertainty estimates, and field validation.

**How is the allocation fair?**

Essential needs are considered before weighted remaining need, and the plan exposes per-level coverage and shortfalls. The formula is a policy proposal residents can inspect and change. It does not infer that upper-level residents matter more, and it does not hide scarcity.

**How much of the track does it address?**

It connects challenges 1, 2, 3, 4, 7, and 8: failure warnings, resource fairness, heat, water, communication, and family check-ins. The scope stays focused on keeping people alive underground.

**What is production work still missing?**

Real sensor integration and calibration; secure identities and messages; a reliable transport with acknowledgments; governance of allocation assumptions; independent accessibility and safety evaluation; and operational partners who can act on warnings.

## A credible closing line

“Hollow Signal does not repair a geothermal plant. It helps a neighborhood see a failure coming, share what remains, and know who still needs help.”
