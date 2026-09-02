# Handoff: eChook Live — Data Homescreen & Battery Store redesign

## Overview

Two new/redesigned screens for **eChook Live** (Vue 3 + Vite + Tailwind + Pinia + ECharts), plus the
design system they are built from:

1. **Data Homescreen** — a new at-a-glance car status screen. Becomes the default tab on the
   dashboard, ahead of Graph. Combines the live data ribbon's role with elements pulled forward from
   the admin-only Analytics tab.
2. **Battery Store** — a redesign of the existing `batteries` tab: adding, assigning (fitment) and
   managing packs.

## About the design files

Everything in `designs/` is a **design reference written in HTML** — a prototype showing intended
layout, hierarchy, copy and states. **Do not copy this markup into the app.** The task is to
recreate these designs in eChook Live's existing environment: Vue 3 SFCs, Tailwind utility classes,
the `primary` colour token, Heroicons v2 outline, the existing Pinia stores, and the file/JSDoc
conventions already used in `src/`.

Open the `.dc.html` files in a browser to view them (they need `support.js`, which is included in the
same folder). `ui-design-system-standalone.html` is a fully self-contained copy of the design system
doc — no dependencies, opens offline.

## Fidelity

**High fidelity.** Colours, type sizes, spacing, radii, borders and copy are all final and should be
matched. Two caveats:

- The screens are drawn **dark-theme only**. Every surface must ship light and dark together, per the
  design system's dark-mode rules. Light-theme equivalents: `#171717→#fafafa` app bg,
  `#262626→#ffffff` surface, `#1f1f1f→#fafafa` inset, `#404040→#e4e4e7` border,
  `#333→#f4f4f5` hairline, `#fff→#18181b` text, `#9ca3af→#71717a` muted, `#d1d5db→#3f3f46` secondary.
- Charts and sparklines are drawn as CSS bars for illustration only. Use ECharts with
  `constants/chartTheme.js` colours, as `TelemetryGraph.vue` already does.

## Product rules these designs encode

These are constraints from the product owner. They shape the UI and must survive implementation:

1. **The tool provides data, never strategy.** No projections, no "hold X mph", no "replace this
   battery". Report measured facts and rates; let the team draw conclusions.
2. **Pack capacity is unknown to eChook.** Never infer remaining energy or a fuel-gauge SoC. Any
   budget/allowance figure is a value the *team* entered, and must be labelled as theirs.
3. **Derived numbers state their basis and confidence.** SoC estimates carry a ± band and the curve
   used; IR estimates carry sample count and r².
4. **Race start and lap detection are not yet robust.** Nothing on these screens may depend on them.
   All windows are time-based. Lap-derived figures are withheld with an explicit reason and an
   opt-in override.
5. **No spectator positions or gaps** (out of scope here, but relevant to `SpectatorView.vue`): only
   a minority of the field runs eChook, so any implied order could contradict official results.

---

# Screen 1 — Data Homescreen

**File:** `designs/eChook Data Homescreen.dc.html`
**Replaces/extends:** a new tab in `src/views/DashboardView.vue`'s `tabs` computed (id `status`,
label `Status`, icon `ChartBarSquareIcon`), placed first and made the default `settings.activeTabId`.

## Purpose

Answer "what is the car doing, and is anything wrong" without reading a chart. Aimed at the pit wall
mid-session.

## Layout

App shell, matching `DashboardView.vue`'s existing structure:

- Root: `h-screen overflow-hidden flex flex-col`. **Only the tab content column scrolls** — the
  header and icon rail stay pinned. (Getting this wrong scrolls the connection chips off screen.)
- Header: existing `DashboardHeader.vue`, 64px, unchanged.
- Icon rail: existing 64px `w-16` rail. New Status tab is the first item.
- Content column: `flex-1 min-w-0 overflow-y-auto`, padding `20px 24px 48px`.

Content, top to bottom:

1. **Title row** — `h1` "Car Status" (20px/700) + window segmented control + window meta + live-state
   chip pushed right with `margin-left:auto`.
2. **Predictive warning banner** (conditional, max one).
3. **"Now" tier** — `grid-template-columns: repeat(auto-fit, minmax(212px, 1fr))`, gap 12px, 4 cards.
4. **Two-up panels** — `repeat(auto-fit, minmax(420px, 1fr))`, gap 16px: Energy delivered, Battery
   condition.
5. **Three-up panels** — `repeat(auto-fit, minmax(300px, 1fr))`, gap 16px: Thermal, Driver inputs,
   Data quality.
6. **Detected events** table, full width.
7. Closing caveat paragraph, 12px muted, `max-width: 88ch`.

## Components

### Window selector (segmented)

Container `padding:3px; border-radius:8px; background:#262626; border:1px solid #404040`.
Options `Last 10 min` / `30 min` / `All loaded` / `Custom…`, each `padding:5px 12px; border-radius:6px; font-size:12px`.
Active: `background:rgba(203,21,87,.15); color:#f9a8c4; font-weight:600`. Inactive `color:#9ca3af`, hover `#fff`.

Beside it, mono 11px `#9ca3af`: `09:31:18 → 09:41:22 · 2,948 samples`.

**Binding:** drives the analytics window. Reuse `utils/analyticsWindow.js`
(`clampWindowBounds`, `filterSamplesByWindow`) against `telemetry.displayHistory`. Do **not** use
`windowSource: 'lap'` here — this screen is time-window only.

### Live-state chip

`padding:4px 12px; border-radius:9999px; background:rgba(203,21,87,.12); border:1px solid rgba(203,21,87,.5)`.
8px dot `#cb1557` with a 2s pulse; label mono 11px/700, `letter-spacing:.06em`, `#f9a8c4`,
text `FOLLOWING LIVE`.

Locked variant (see the UX assessment doc): `border-color:#f59e0b`, lock icon, label
`LOCKED · LAST 3 LAPS` in `#fcd34d`, plus an underlined `Return to live (L)` action. Bind to whatever
zoom state `requestChartZoom` / `requestChartUnlock` leave behind — it currently isn't observable, so
the store needs to expose it.

### Warning banner

`padding:12px 16px; border-radius:8px; background:rgba(120,53,15,.15); border:1px solid #f59e0b`,
20px `ExclamationTriangleIcon` in `#fcd34d`, text 14px/600 `#fef3c7`, trailing underlined
`Open in Graph` 12px `#fcd34d` at `margin-left:auto`.

Copy pattern: `<Channel> above your warning threshold — <value>, rising <rate> over the last <n> min`.
Note "**your** threshold" — thresholds come from `settings.analyticsSettings`, not from us.

Source: `utils/eventThresholds.js` for the crossing; rate-of-change is new — derive a least-squares
slope over the trailing ~3 min of `telemetry.history` per channel and rank by time-to-limit. **Render
at most one.**

### "Now" cards (4)

Normal: `padding:16px; border-radius:8px; border:1px solid #404040; background:#262626`, column flex, gap 8px.
- Label: 11px/700 uppercase, `letter-spacing:.08em`, `#9ca3af`; unit suffix in parens `#9ca3af`, weight 400.
- Value: mono 40px/700, `line-height:1`, `#fff`.
- Sparkline: 24px tall flex row of 10 bars, `gap:2px`, each `flex:1; border-radius:1px`,
  fill `#3f3f46` with the newest bar `#cb1557`.
- Footer: `padding-top:2px; border-top:1px solid #333`, mono 11px `#9ca3af`, space-between —
  e.g. `mean 23.1` / `max 31.4`.

Warning variant (Motor Temp): `border:1px solid #f59e0b; background:rgba(120,53,15,.15)`; value
`#fcd34d`; a rate badge top-right, mono 11px/700 `#fcd34d` (`+2.1/min`); sparkline fill `#57534e` →
`#f59e0b` → `#fcd34d` as it climbs; footer border `rgba(245,158,11,.3)`, text `#a8a29e`,
showing `your warn 65` / `max 71`.

The four cards are Speed, Pack Voltage, Current, Motor Temp. Threshold state comes from
`evaluateChannelThresholds` + `CARD_THRESHOLD_KEYS` — same mechanism `DataCard.vue` uses.

**Stale values:** keep the existing 50% opacity + grayscale, and additionally print the age
(`38 · 12s`) so old data admits its age instead of merely looking disabled.

### Panel chrome (all panels)

`border:1px solid #404040; background:#262626; border-radius:12px; overflow:hidden`.
Header `padding:14px 20px; border-bottom:1px solid #404040`, `h2` 15px/600 `#fff`, optional 11px
`#9ca3af` basis note (often `margin-left:auto`). Body `padding:20px`.

### Energy delivered

Header note: `measured at the shunt · this window`.
Four figures in a wrapping row, gap 24px: **Charge out** `11.94 Ah`, **Energy out** `281.6 Wh`,
**Rate** `0.42 Ah/min`, **Peukert-norm.** `13.10 Ah`. Each = 10px/700 uppercase `#9ca3af` label +
mono 28px/700 `#fff` value with a 14px `#9ca3af` unit.

Then the team-reference bar: caption `Against **your** reference: 40.0 Ah` + `29.9% used`;
track `height:12px; border-radius:6px; background:#171717; border:1px solid #404040`, fill `#cb1557`.
Caption below, 11px `#9ca3af`: *"Reference is the figure your team entered in Settings. eChook does
not know your pack's real capacity and makes no estimate of what remains."*

No-reference state (show one or the other): `padding:10px 12px; border-radius:6px; background:#171717;
border:1px dashed #525252`, text *"No reference set? The panel shows charge out and rate only —
nothing is inferred."* + `Set reference` link.

Source: `computeEnergyThermalSummary`, `integratePeukertNormalizedNetAh`. Reference value is a new
team setting; store it beside the existing `DEFAULT_BATTERY_PACK_SETTINGS` in `stores/settings.js`.

### Battery condition

Header carries an amber `ESTIMATE` badge (`padding:2px 6px; border-radius:4px; background:#fbbf24;
color:#451a03; font-size:9px/700`) and the note `from voltage & current only`.

Per battery (A, B): mono 11px `#9ca3af` label (64px fixed), then a 26px track
(`border-radius:6px; background:#171717; border:1px solid #404040`) containing the SoC fill
`rgba(203,21,87,.55)` plus an overlaid uncertainty band `rgba(203,21,87,.25)` spanning ±6%, then a
right-aligned mono 16px/700 value `68` with an 11px `#9ca3af` `±6%`.

Caption: *"State of charge inferred from the Yuasa C20 curve at estimated rest voltage. Confidence
**medium** — shaded band is the uncertainty. Not a fuel gauge; treat as a trend."*

Bottom sub-grid (`repeat(auto-fit,minmax(120px,1fr))`, gap 12px, above a `1px #404040` rule):
**IR est. A** `18.4 mΩ` / `n=214 · r²0.94`, **IR est. B** `21.7 mΩ` (amber `#fcd34d` when the pair
diverges), **Sag @ peak** `1.62 V` / `at 96.4 A`, **A–B spread** `0.28 V` / `under load`.
Each: 10px/700 uppercase label, mono 18px/700 value, mono 10px `#9ca3af` basis line.

Source: `computeBatterySoC`, `lookupYuasaC20SocFromVoltage`, `estimateC20TerminalVoltage`,
`computeSupplyResistance` (honour `irEstimationOptions` from settings), `computeBatteryWindowMetrics`.

### Thermal

Three space-between rows (12px `#9ca3af` label, mono 16px/700 value): Motor `71 °C` (`#fcd34d` when
over threshold), Controller `38 °C`, `Δ Motor − Controller` `33 °C`.
Then, above a rule: **Time in band · motor** — a single 20px bar,
`border-radius:4px; border:1px solid #404040`, segments `#3f3f46` / `#f59e0b` / `#fcd34d` at
54/31/15%, with a mono 10px `#9ca3af` legend `<65 · 54%` / `65–70 · 31%` / `>70 · 15%`.
Caption: *"Bands come from the thresholds your team set, not from us."*

Source: `computeHeroBandBarMetrics`, `computeEnergyThermalSummary`.

### Driver inputs

Throttle histogram: 64px tall, 10 bars, `gap:3px`, `border-radius:2px 2px 0 0`, `#3f3f46` with the
top bin `#cb1557`; axis labels mono 10px `#9ca3af` (`0%` / `throttle` / `100%`).
Below a rule, three space-between rows: `Time at >90% throttle` `41%`, `Throttle + brake overlap`
`3 events` (`#fcd34d` when > 0), `Longest overlap` `1.4 s`.

Source: `computeChannelHistogram(samples,'throttle')`, `computeThrottleBrakeOverlap`.

### Data quality

Header note `be suspicious of gaps`. Four space-between rows: Packet rate `4.9 /s`, Last packet
`0.4 s ago`, Gaps in window `2 · max 3.1 s` (amber), Channels reporting `14 / 16`.

Then the lap-detection honesty box: `padding:12px; border-radius:6px;
background:rgba(120,53,15,.15); border:1px solid rgba(245,158,11,.5)`; heading 11px/700 uppercase
`#fcd34d` `Lap detection · low confidence`; body 12px `#fef3c7`: *"8 boundaries found, 2 flagged as
uncertain. Per-lap figures are hidden on this screen; everything above is time-window based and
unaffected."*; then `Show lap figures anyway` link `#fcd34d`.

Source: `annotateLapConfidence` / `scoreLapConfidence` for the counts; gap detection from
`MAX_LINE_GAP_MS` in `utils/chartData.js`.

### Detected events table

Header + `Export CSV` link (`exportEventsAsCsv`). `thead` row `background:#1f1f1f`, headers 10px/700
uppercase `letter-spacing:.1em` `#9ca3af`, `border-bottom:1px solid #404040`. Body rows
`border-bottom:1px solid #333`, cells `padding:10px 20px` (12px horizontally for middle columns).
Columns: Time (mono), Channel, Event, Value (mono/700, right), and a `Jump` link.

`Jump` uses `buildEventJumpWindow` + `telemetry.requestChartZoom` and switches to the Graph tab.
Rows come from `detectReliabilityEvents` plus threshold transitions
(`getCriticalTransitions`).

## Interactions

- Window buttons re-derive every figure; `Custom…` opens `AnalyticsWindowPickerModal.vue` (reuse).
- Live-state chip: click returns to live (`requestChartUnlock`).
- Warning banner "Open in Graph": select the channel in `selectedDashboardKeys`, switch tab.
- Row/link hovers: `#2d2d2d` on rows; underlined links lighten.
- Pause: per the assessment, pause deserves a page-level bar, not just a header icon state.
- Motion: 150–300ms ease; the only looping animation is the 2s status-dot pulse. Honour
  `prefers-reduced-motion`.

---

# Screen 2 — Battery Store

**File:** `designs/eChook Battery Store.dc.html`
**Replaces:** `src/components/tabs/BatteriesTab.vue` and its children —
`batteries/HeroSection.vue`, `BatteryTable.vue`, `AddBatteryModal.vue`,
`BatteryDetailModal.vue`, `AddCarModal.vue`, `EmptyStoreView.vue`, `TabTopBar.vue`.
**Store:** `src/stores/battery.js` — no API changes required.

## What changes and why

| Problem today | Redesign |
|---|---|
| Fitment is two `<select>` dropdowns showing only `label` | Two physical slots, **UPPER above LOWER**, each a filled pack card or an empty slot with a "Fit a battery" action |
| `activeBatteries` offers packs already fitted to other cars — double-fitment is one click away | Every pack carries a **Where** chip; unavailable packs are excluded from the picker with the reason stated |
| `assignedAt` date+time inputs sit as peers of the pickers | A **`Now`** chip by default with a `Fitted earlier…` escape |
| Inventory columns are Name / Serial / Age / Capacity / Status — no condition | Measured-vs-nominal with a fade bar, cycles, critical discharges, Ah out, and location |
| 20 field/value pairs inside a modal | Row expands **inline**; four modals collapse into the page |
| `statsUpdatedAt` only visible after opening a row | Store-level freshness bar at the top |

## Layout

Same shell. Content column:

1. **Title block** — `h1` "Battery Store" (20px/700) + amber `BETA` badge; subtitle 13px `#9ca3af`
   `Ridgeway Racing · 6 packs · shared with 2 cars`. Right-aligned actions: secondary
   `Cars & access` (UsersIcon) and primary `Add battery` (PlusIcon), both 40px tall.
2. **Stats freshness bar** — `padding:10px 14px; border-radius:8px; background:#262626;
   border:1px solid #404040`, ClockIcon, `Lifetime figures last rebuilt **today 03:04**`,
   `· next overnight run ~03:00 · 1 pack queued`, and a `Rebuild stats` link at
   `margin-left:auto`. Sources: `fetchStatsBackfillStatus`, `requestStatsBackfill`,
   `statsBackfillStatus`.
3. **Two-column grid** — `grid-template-columns: minmax(340px,420px) 1fr; gap:20px; align-items:start`:
   fitment panel left, inventory right.

### Fitment panel — "Fitted to this car"

Header note = car name. Body is a 12px-gap column of:

**Filled slot** — a 44px position rail (`background:#1f1f1f; border:1px solid #404040;
border-radius:8px`) with the label rotated vertically (`writing-mode:vertical-rl;
transform:rotate(180deg)`, mono 10px/700, `letter-spacing:.1em`, `#9ca3af`), beside a card
(`flex:1; border:1px solid #404040; border-radius:8px; background:#1f1f1f; padding:14px`) containing:
- Name 15px/700 `#fff`; mono 11px `#9ca3af` `RR-A01 · 2y 6m old`.
- A 32px square icon button top-right, `XMarkIcon`, hover
  `background:rgba(244,63,94,.2); color:#f43f5e; border-color:rgba(244,63,94,.5)`,
  with `title` + `aria-label` "Remove Alpha from the upper position".
- Three figures, gap 16px: **Measured cap.** `34.2 Ah`, **Cycles** `118`, **Critical** `0`
  (10px/700 uppercase label, mono 18px/700 value).
- Footer above a `1px #333` rule: green 8px dot, `Fitted since **09:12 today**` 12px, and a
  `Details` link right.

**Empty slot** — same rail, then `border:1px dashed #525252; background:#1c1c1c; padding:20px 14px`,
centred: `Lower position is empty`, a 40px outlined-primary `Fit a battery` button
(`background:#262626; border:1px solid #cb1557; color:#f9a8c4`), and 11px `#9ca3af`
*"or drag one across from the inventory"*.

**"Fitted at" row** — `background:#1f1f1f; border:1px solid #404040; border-radius:6px`:
10px/700 uppercase `FITTED AT`, an active `Now` pill (`rgba(203,21,87,.15)` on
`rgba(203,21,87,.5)`, `#f9a8c4`), a `Fitted earlier…` link, and 11px `#9ca3af`
`Can't be in the future` right-aligned. Clicking the link reveals the existing date+time inputs
(`msToDateInput` / `msToTimeInput` / `combineDateTimeInput`, `max` clamped to now — keep
`HeroSection.vue`'s existing clamp `watch`).

**Live pack voltage** row above a rule: 12px `#9ca3af` label, mono 16px/700 `23.4 V`
(`telemetry.liveData?.voltage`).

Actions map to `assignBatteries({ carId, upper?, lower? })` and
`unassignBattery({ carId, position })` — unchanged, still atomic, still confirmed via
`ConfirmationModal.vue`.

### Inventory panel

Header: `h2` Inventory + a segmented filter (`All 6` / `Available 2` / `Fitted 3` / `Retired 1`,
same segmented styling as the homescreen) + `Sorted by measured capacity` right.

**The rows must not collapse.** Wrap the whole row region in `overflow-x:auto` with an inner
`min-width:796px` — this is what `BatteryTable.vue` already does with `overflow-x-auto`. Column
widths: Pack `flex:1 1 168px; min-width:168px`, then fixed `132 / 84 / 64 / 96 / 152`px with
`flex-shrink:0`, gap 12px, `padding:12px 20px`.

Column header strip: `background:#1f1f1f; border-bottom:1px solid #404040`, labels 10px/700
uppercase `#9ca3af`: Pack · Measured / nominal · Cycles · Crit. · Ah out · Where.

Row content:
- **Pack**: name 14px/600 `#fff`; mono 11px `#9ca3af` `RR-E05 · 1y 8m` (`formatBatteryAge`).
- **Measured / nominal**: mono 14px/700 value + mono 11px `#9ca3af` `/ 36.0 · 99%`; below it a 5px
  bar (`background:#1f1f1f; border:1px solid #404040; border-radius:3px`) filled to the percentage —
  `#22c55e` ≥90%, `#fbbf24` 75–89%, `#9ca3af` when retired.
- **Cycles / Crit. / Ah out**: mono 14px, right-aligned; Crit. turns `#fcd34d` when > 0.
- **Where** chip, `padding:3px 10px; border-radius:9999px`, 11px/600:
  - `Available` — `rgba(34,197,94,.12)` on `rgba(34,197,94,.45)`, text `#86efac`
  - `This car · upper` — `rgba(203,21,87,.15)` on `rgba(203,21,87,.5)`, text `#f9a8c4`
  - `Falcon 3 · lower` — `#1f1f1f` on `#525252`, text `#d1d5db`
  - `Retired 04/2026` — same neutral treatment, row at `opacity:.6`

Row hover `#2d2d2d`; the pack fitted to this car sits on `rgba(203,21,87,.06)`. Retired packs go
below a `Retired` divider strip (existing `BatteryTable.vue` behaviour, kept).

**Expanded row** (`background:#2d2d2d`): an action row — `Edit details`, `Rebuild stats`,
`Retire pack` (hover to rose), plus a plain-language blocker when relevant
(*"Fitted to Falcon 3 — unfit it there before assigning here"*). Then **Lifetime ·
server-computed, rebuilt overnight**: `repeat(auto-fit,minmax(128px,1fr))`, gap 14px, 11px `#9ca3af`
labels over mono 16px/700 values — Discharges, Charges, Critical discharges, Ah delivered,
kWh delivered, Voltage seen (`10.4 – 13.8`), Discharge time, Avg discharge, Distance.

Closing caveat: *"Measured capacity is the figure **your team** entered — eChook doesn't test packs.
Cycles and critical discharges are counted from telemetry while this pack was assigned, so they only
cover time it was fitted to an eChook car."*

Fields map 1:1 to the existing record: `numberOfDischarges`, `numberOfCharges`,
`numberOfCriticalDischarges`, `totalAhDelivered`, `totalKwhDelivered`, `lifetimeMinVoltage`,
`lifetimeMaxVoltage`, `totalDischargeTime`, `averageDischargeCurrent`, `totalDistanceTravelled`,
`statsUpdatedAt`, `statsBackfillStatus`.

### Supporting states (bottom of the design file)

- **Fit a battery** picker: rich rows (name, `RR-E05 · 22 cycles · 0 critical`, measured Ah + % of
  nominal), selected row `border:1px solid #cb1557; background:rgba(203,21,87,.08)`. A dashed note
  explains omissions: *"Alpha is in this car's upper position and Charlie and Delta are on Falcon 3,
  so they aren't offered — no more accidental double fitment."* Actions reversed
  (`flex-direction:row-reverse`): primary `Fit Echo to lower`, then `Cancel`.
  **Availability rule:** a pack is offerable when `status === 'active'` **and** it is not in any
  car's current fitment. `fetchCurrentFitment` is per-car today, so the store needs either a
  store-wide fitment endpoint or the assignment field returned on the battery list.
- **Add a battery**: preset chips first (`Yuasa REC36-12I` / `Custom`) — caption *"Sets 36.0 Ah
  nominal and Peukert 1.15 — the same defaults Analytics uses."* Then Name + Serial (`10 max`, mono),
  Manufactured (month select + year, caption *"Month and year only — it's what's stamped on the
  case."*), then a **Measured capacity** group above a rule: Nominal (prefilled, muted), Measured
  (the only emphasised field), Peukert (prefilled, muted) — caption *"If you've capacity-tested the
  pack, put your figure in **Measured**. Leave it and it matches nominal — eChook never estimates it
  for you."* Maps to `createBattery({ label, serial, dateStamp, originalCapacity, actualCapacity,
  peukertConstant })`; keep `BatteryManufactureDateFields.vue`.
- **Cars & access**: member rows with `Owner` chip / `Revoke` link, a `Grant another car` button, and
  the caption *"Granting sends a 6-digit code to the other car's team — they confirm before anything
  is shared."* (`requestGrantAccess` → `confirmGrantAccess`, `authorisedCars`).
- **No store yet**: `CarBatteryIcon` in a 44px tile, one-sentence value proposition, primary
  `Create battery store` (44px), and *"Stats are computed on the server from telemetry you've already
  sent. Nothing new is collected."* (`createStore`).

Demo mode keeps the existing italic-muted "Battery Store is not available in demo mode."

---

## State

Nothing new server-side. Additions:

- `settings`: default dashboard tab becomes `status`; a team **energy reference (Ah)** value;
  optional per-channel rate-warning enable.
- `telemetry`: expose the **chart zoom lock state** (currently `requestChartZoom` /
  `requestChartUnlock` leave nothing observable) so the live-state chip can render it. Also expose
  packet rate / gap count for the Data quality panel.
- `battery`: store-wide fitment (which pack is on which car+position) so availability can be
  computed; local UI state for filter, expanded row id, and the fit-picker target position.

## Design tokens

Primary `#cb1557` everywhere, both themes. Interactive text on dark surfaces uses **`#f472a0`** —
raw `#cb1557` is only 2.7:1 on `#262626` and fails AA.

| Role | Dark | Light |
|---|---|---|
| App bg | `#171717` | `#fafafa` |
| Surface | `#262626` | `#ffffff` |
| Inset | `#1f1f1f` | `#fafafa` |
| Border | `#404040` | `#e4e4e7` |
| Hairline | `#333333` | `#f4f4f5` |
| Text | `#ffffff` | `#18181b` |
| Secondary text | `#d1d5db` | `#3f3f46` |
| Muted text | `#9ca3af` | `#71717a` |

**Do not use `#6b7280` for text** — it fails AA at these sizes on both `#262626` and `#171717`.

Status: OK `#22c55e` / `#86efac`; warning `#f59e0b`, `#fbbf24`, `#fcd34d`, `#fef3c7`, tint
`rgba(120,53,15,.15)`; error `#ef4444` / `#f43f5e` / `#fda4af`; neutral chip `#1f1f1f` on `#525252`.

Spacing 2/3/4/6/8 (8/12/16/24/32px). Radius 6 controls · 8 buttons+cards · 12 panels · full pills.
Type: system sans; Oswald **only** for the `eChook` wordmark; mono for every live/derived value.
Sizes 40 hero · 28 panel figure · 20 h1 · 18 sub-figure · 15 panel title · 14 body · 13 secondary ·
12 caption · 11 micro · 10 uppercase label (`letter-spacing:.1em`).

Motion: `active:scale-95`, 200ms card hover, 150–300ms panels, 2s status pulse only, all with
reduced-motion fallbacks.

## Accessibility

- Icon-only buttons need `title` + `aria-label` (removal buttons name the position).
- Touch targets ≥ 44px; the 32px slot-remove button is the one exception and sits beside a
  full-size alternative in the expanded row.
- Status is never colour alone — dot plus label, chip plus text.
- Active nav sets `aria-current="page"`; modals trap focus and close on Escape.
- Every muted caption must clear 4.5:1.

## Assets

Heroicons v2 outline (already a dependency): ChartBarSquare, ChartBar, Map, TableCells,
Cog6Tooth, Users, Plus, XMark, Clock, ExclamationTriangle, ArrowDownTray, ArrowPath.
The battery rail icon is the repo's own `src/components/icons/CarBatteryIcon.vue` — use it, not a
Heroicons battery. No new images or fonts.

## Files in this bundle

| File | What it is |
|---|---|
| `designs/eChook Data Homescreen.dc.html` | Screen 1 |
| `designs/eChook Battery Store.dc.html` | Screen 2 (incl. supporting states) |
| `designs/eChook Design System.dc.html` | Tokens, components, do/don't |
| `designs/ui-design-system-standalone.html` | Same, fully self-contained (also at `docs/design/` in the repo) |
| `designs/eChook UX Assessment.dc.html` | The 12 findings these screens answer. Mockup 1 and finding 11 carry "superseded" notes — read them |
| `designs/support.js` | Runtime the `.dc.html` files need to render |

## Suggested order

1. Tokens: add the dark-surface link colour rule and retire `#6b7280` as a text colour.
2. Battery Store — self-contained, no new derived maths, biggest UX win per hour.
3. Homescreen panels that reuse existing `analyticsMetrics` functions.
4. New derived work: rate-of-change warnings, chart-zoom lock state, packet-rate/gap metrics.
