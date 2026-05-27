# Analytics & Laps — Implementation Backlog

Editable checklist of features discussed but **not yet implemented** (as of commit `8181058` on `main`).

Use this file to prioritise, assign, and track work. Change status values as you go:
`[ ]` not started · `[~]` in progress · `[x]` done · `[-]` dropped

---

## How to use this document

1. Delete or strike through items you do not want.
2. Reorder sections by priority.
3. Add notes, owner, target release, or dependencies in the **Notes** column.
4. Split large items into smaller tasks when you start implementation.

**Constraints to remember**

- No new sensors planned — all items must use existing channels only.
- Lap counting is not fully reliable — prefer features that tolerate noisy laps or work on raw time windows.
- Analytics tab is admin-only today — note if a feature should stay admin-only or move to Laps / Graph.

---

## 1. Settings & configuration UI


| Status | Item                                                                                                       | Notes                                         |
| ------ | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| [ ]    | Settings tab UI for `analyticsSettings` (live window minutes, overlap throttle %, start current threshold) | Store + import exist; no user-facing controls |
| [ ]    | Export/import includes analytics settings in Settings download help text                                   | Verify round-trip in UI                       |


---

## 2. Session & stint overview (Analytics or Dashboard)

These should all be shown in a collapsible menu per race in the laps tab as well as in a section in the live analytics tab.


| Status | Item                                                       | Notes                                                                  |
| ------ | ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| [ ]    | Session KPI row: best lap time                             | From `LL_Time` or derived from history                                 |
| [ ]    | Session KPI row: median lap time                           |                                                                        |
| [ ]    | Session KPI row: lap consistency (std dev of lap times)    |                                                                        |
| [ ]    | Session KPI row: total laps in session                     |                                                                        |
| [ ]    | Session KPI row: trend of last N laps (sparkline or table) | e.g. last 5 laps                                                       |
| [ ]    | Session KPI row: total Ah consumed (session)               | From `ampH` / lap summaries                                            |
| [ ]    | Session KPI row: average lap efficiency (`LL_Eff`)         |                                                                        |
| [ ]    | Session KPI row: max temperature (`temp1` / `temp2`)       |                                                                        |
| [ ]    | Session KPI row: max voltage imbalance (`voltageDiff`)     |                                                                        |
| [ ]    | **Stint summary** row per race on Laps tab                 | Best lap, median, consistency, total Ah, avg efficiency, thermal trend |


---

## 3. Lap performance (extend Laps tab)


| Status | Item                                                                      | Notes                                                  |
| ------ | ------------------------------------------------------------------------- | ------------------------------------------------------ |
| [ ]    | Delta to **best lap** (not only delta vs previous lap)                    | Per metric column                                      |
| [ ]    | Delta to **rolling average** (e.g. last 3 laps)                           |                                                        |
| [ ]    | Lap **degradation** view: lap time trend over stint                       | Chart or inline sparkline                              |
| [ ]    | Lap degradation: energy-per-lap trend (`LL_Ah`)                           |                                                        |
| [ ]    | Lap degradation: efficiency trend (`LL_Eff`)                              |                                                        |
| [ ]    | **Lap confidence** badge per lap: good / suspect / invalid                | Heuristics: zero `LL_`*, time bounds, lap number jumps |
| [ ]    | Filter: hide suspect / invalid laps                                       |                                                        |
| [ ]    | Filter: exclude first lap (out lap)                                       |                                                        |
| [ ]    | Filter: minimum lap time threshold                                        |                                                        |
| [ ]    | **Baseline comparison** mode: compare current race vs selected prior race | Same track preferred; best/median/energy deltas        |
| [ ]    | Rolling trends inside lap table (mini sparklines per column)              | Optional; higher UI effort                             |


*Existing on Laps: lap-to-previous diff, background bars, CSV export, view on graph — no need to re-implement.*

---

## 4. Energy & battery health


| Status | Item                                                                    | Notes                                                       |
| ------ | ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| [ ]    | Voltage vs current scatter or time-series (load sag visualisation)      | Complements resistance number                               |
| [ ]    | `voltageDiff` trend over session / per lap                              | Cell balance proxy                                          |
| [ ]    | Load-normalised imbalance: `voltageDiff / max(I, ε)`                    |                                                             |
| [ ]    | Alert when imbalance exceeds threshold                                  |                                                             |
| [ ]    | Average / peak power per lap (`P = V × I`)                              |                                                             |
| [ ]    | Energy proxy per lap (`LL_Ah` × mean V or integrated Wh)                |                                                             |
| [ ]    | Wh-per-mile efficiency trend                                            |                                                             |
| [ ]    | Projected remaining stint quality (simple model from Ah used vs target) | Target to be set in settings - linked to from analytics tab |


---

## 5. Thermal


| Status | Item                                                                | Notes |
| ------ | ------------------------------------------------------------------- | ----- |
| [ ]    | `temp1` / `temp2` trend over session (Analytics card or graph link) |       |
| [ ]    | `tempDiff` asymmetry trend                                          |       |
| [ ]    | Thermal rise rate per minute or per lap                             |       |
| [ ]    | Sustained high-temperature dwell time (above threshold)             |       |
| [ ]    | Warning when rise rate exceeds limit lap-over-lap                   |       |


---

## 6. Track & GPS performance


| Status | Item                                                                  | Notes                               |
| ------ | --------------------------------------------------------------------- | ----------------------------------- |
| [ - ]  | Map colourised by **time loss** vs reference (not only single metric) | Needs reference lap or best lap     |
| [ - ]  | Fastest lap vs reference lap GPS trace overlay                        |                                     |
| [ - ]  | Highlight regions where time is gained/lost                           | Sector-free version: distance-based |
| [ - ]  | Corner entry / exit speed proxies from speed trace + GPS              | No steering channel; heuristic only |


---

## 7. Pro-style race analytics (sectors, reference, deltas)

*Higher effort; depends on lap/GPS reliability.*


| Status | Item                                                           | Notes                                     |
| ------ | -------------------------------------------------------------- | ----------------------------------------- |
| [ ]    | User-defined **sectors** / splits on track map                 | Auto Sectors from GPS, 4 sectors per lap. |
| [ ]    | Sector times per lap (S1, S2, S3…)                             |                                           |
| [ - ]  | **Theoretical best lap** (best sectors stitched)               |                                           |
| [ ]    | **Reference lap** selection (best lap, specific lap, imported) |                                           |
| [ ]    | **Time delta** plot vs reference (distance- or time-based)     | MoTeC/AiM-style                           |
| [ ]    | Rolling best time                                              |                                           |
| [ ]    | Split time report table with colour coding                     |                                           |


---

## 8. Channel statistics & distributions


| Status | Item                                                                                             | Notes                                                                             |
| ------ | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| [ ]    | **Channels report**: min / max / avg / stddev per lap for chosen metrics                         | e.g. voltage, current, speed, throttle                                            |
| [ ]    | Channels report by **sector** (if sectors exist)                                                 |                                                                                   |
| [ ]    | Scatter plot: e.g. % distance in lap vs speed, current, voltage and throttle, current vs voltage |                                                                                   |
| [ - ]  | Scatter: speed vs distance for line choice                                                       |                                                                                   |
| [ ]    | Histograms for metrics other than throttle (current, speed, voltage)                             | Histograms to be implemented with eCharts plugin                                  |
| [ - ]  | G-G style plot                                                                                   | Only if lat/long accel available — **not in current channels**; skip unless added |


---

## 9. Reliability, alerts & event log


| Status | Item                                                               | Notes                    |
| ------ | ------------------------------------------------------------------ | ------------------------ |
| [ ]    | Session **event log**: undervoltage, over-temp, high current spike | Timestamped list         |
| [ ]    | Event: throttle+brake overlap (link to Analytics overlap)          | Engine exists; no log UI |
| [ ]    | Event: data dropout / gap in telemetry (>30s)                      |                          |
| [ ]    | Event: stale live data (no packets)                                |                          |
| [ ]    | Configurable thresholds per alert type                             |                          |
| [ ]    | Severity badges + “view on graph” jump for each event              |                          |
| [ ]    | Export events as CSV                                               |                          |


---

## 10. Analytics tab UX enhancements


| Status | Item                                                  | Notes                  |
| ------ | ----------------------------------------------------- | ---------------------- |
| [ ]    | Collapsible sections / cards layout polish            |                        |
| [ ]    | “Mark race start” manual override for start metrics   | When auto-detect fails |
| [ ]    | Copy/export Analytics summary for a session           | Text or CSV            |
| [ ]    | Link from Analytics metric → Graph zoom preset        |                        |
| [ ]    | Live mode: auto-collapse start card after first 60s   | Mentioned in design    |
| [ ]    | History mode: compare two races side-by-side          |                        |
| [ - ]  | Component tests: admin-only tab visibility            |                        |
| [ ]    | Component tests: live/history mode switch             |                        |
| [ ]    | Component tests: disclaimer shown for low-rate timing |                        |


---

## 11. Session database & multi-session (large scope)

These are good, but for future implementation. They will need server side changes


| Status | Item                                                                | Notes                             |
| ------ | ------------------------------------------------------------------- | --------------------------------- |
| [ - ]  | Session list / calendar across days (beyond current history picker) |                                   |
| [ - ]  | Smart collections (by track, team, date range)                      |                                   |
| [ - ]  | Compare multiple sessions overlaid                                  |                                   |
| [ - ]  | Session naming / metadata (weather, driver notes)                   |                                   |
| [ - ]  | Cloud sync of analysis profiles                                     | Out of scope unless backend added |


---

## 12. Video & external tooling


| Status | Item                                              | Notes                                      |
| ------ | ------------------------------------------------- | ------------------------------------------ |
| [ - ]  | Video sync with telemetry                         | **No video channel** — likely out of scope |
| [ - ]  | Export to MoTeC / AiM / CSV for external analysis | Partial CSV exists for raw history         |
| [ - ]  | Custom **math channels** (user-defined formulas)  | Large feature                              |


---

---

## 14. Explicitly out of scope (from discussion)


| Status | Item                                                             | Reason                                             |
| ------ | ---------------------------------------------------------------- | -------------------------------------------------- |
| [-]    | Driver **smoothness** score                                      | Greenpower throttle style is intentionally digital |
| [-]    | New physical sensors (brake pressure, steering, suspension, IMU) | Not available on cars                              |
| [-]    | Move lap table into Analytics tab                                | Keep Laps separate by design                       |


---

## Suggested priority tiers (edit as you like)

### Tier A — High value, existing data, moderate effort

- Settings UI for analytics thresholds  
- Lap delta-to-best + stint summary on Laps  
- Lap confidence flags + filters  
- Session KPI strip on Analytics  
- Thermal + energy summary cards (extend Analytics)  
- Event log with overlap / undervoltage / dropout

### Tier B — Strong value, more engineering

- Reference lap + time delta plot  
- Theoretical best lap  
- Channels report per lap  
- Baseline race comparison  
- Voltage vs current / imbalance alerts

### Tier C — Large / depends on lap quality

- Sectors / splits  
- Map time-loss overlay  
- Multi-session database UI  
- Math channels

---

## Changelog (optional)


| Date | Change                                             |
| ---- | -------------------------------------------------- |
|      | Initial backlog from analytics planning discussion |


