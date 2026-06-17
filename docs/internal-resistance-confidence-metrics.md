# Internal Resistance and Confidence Metrics (Current Implementation)

## Purpose

This document describes how the codebase currently computes and presents battery internal-resistance metrics, including how confidence labels are produced and displayed.

The focus is the battery analytics flow used in the Analytics tab:

- `src/components/tabs/AnalyticsTab.vue`
- `src/utils/analyticsMetrics.js`
- `src/components/analytics/BatterySectionPanel.vue`
- `src/components/analytics/BatteryResistanceScatterChart.vue`
- `src/components/analytics/BatteryResistanceAhChart.vue`

---

## 1) Data Inputs Used for Resistance

Resistance estimation is based on telemetry samples from `telemetry.displayHistory` (selected live/history window in `AnalyticsTab`), using:

- `current`
- `voltage` (combined pack)
- `voltageLower` (lower battery branch)
- `voltageHigh` (upper battery branch)
- `timestamp`

Notes:

- `voltageHigh` and `voltageDiff` are derived in `src/utils/unitConversions.js`.
- Branch resistance is calculated independently for:
  - Total pack (`voltage`)
  - Lower battery (`voltageLower`)
  - Upper battery (`voltageHigh`)

---

## 2) High-Level Processing Flow

1. `AnalyticsTab` computes `activeSamples` (live or history window).
2. `computeSupplyResistance(activeSamples, { minSampleCount: 8, minCurrentSpread: 5 })` runs.
3. `computeBatteryWindowMetrics(..., { supplyResistance })` builds per-branch chart series, including IR-vs-Ah.
4. `BatterySectionPanel` renders:
   - Resistance value (mOhm)
   - Fit R2
   - Confidence label
   - V-I scatter chart and fit line
   - IR-vs-Ah chart with its own series confidence

---

## 3) Core Resistance Model

The code fits a linear model:

- `V = V_oc - I * R`
- Rearranged linear form: `V = intercept + slope * I`
- Therefore:
  - `V_oc = intercept`
  - `R = -slope`

Implementation details:

- Fit is ordinary least squares via `linearRegression(xs, ys)`.
- Inputs:
  - `xs` = current values
  - `ys` = voltage values
- `R2` is computed and stored as fit quality.

A resistance fit is invalid when:

- Fewer than minimum samples
- Current spread is too small
- Regression fails
- Computed resistance is non-physical (`R <= 0` or non-finite)

---

## 4) Fit Dataset Construction

For each branch, `buildResistanceDataset(samples, voltageKey)`:

- Reads `timestamp`, `current`, and selected voltage channel.
- Keeps only entries where all three are finite.

Branch validity can fail independently. If lower/high channels are absent, reasons are explicitly rewritten to:

- `missing_voltage_lower`
- `missing_voltage_high`

This is done after fit attempts so the UI can distinguish "not enough samples" from "channel not present."

---

## 5) Resistance Fit Gating Rules

Default thresholds inside `computeSupplyResistance`:

- `minSampleCount = 8`
- `minCurrentSpread = 5 A`
- `rollingWindowSize = 12`
- `rollingStep = 4`

`AnalyticsTab` explicitly calls with:

- `minSampleCount: 8`
- `minCurrentSpread: 5`

So the branch fit gates are:

- At least 8 valid V-I samples
- `max(current) - min(current) >= 5 A`
- Regression returns finite, positive resistance

Returned branch fields include:

- `valid`
- `reason` (if invalid)
- `sampleCount`
- `currentSpread`
- `fitR2`
- `rMilliOhm`
- `openCircuitVoltage`
- `confidence`
- `trend` and `rolling` (see below)

---

## 6) Rolling Resistance Windows and Trend

After a valid full-window fit, rolling sub-window fits are computed:

- Window length: 12 samples
- Step: 4 samples
- Per-window gating repeats:
  - Current spread >= 5 A
  - Valid regression
  - Positive resistance

Each valid rolling point stores:

- Midpoint timestamp of the window
- `rMilliOhm`
- `fitR2`

If at least two rolling points exist, the code also computes:

- `trend.slopeMilliOhmPerMin` (linear fit of rolling resistance over time)
- `trend.deltaRMilliOhm` (last rolling R minus first rolling R)

---

## 7) Confidence for Branch Resistance (Card-Level)

Branch confidence is rule-based in `estimateSupplyResistanceFromDataset`:

- **high** if:
  - `fitR2 >= 0.8`
  - `sampleCount >= 20`
  - `currentSpread >= 10 A`
- **medium** if:
  - `fitR2 >= 0.5`
  - `sampleCount >= minSampleCount`
- Otherwise **low**

This confidence is shown in battery KPI cards and color-coded:

- high: green
- medium: amber
- low: red

---

## 8) IR-vs-Ah Series Construction

IR-vs-Ah is built by `buildResistanceVsAhSeries(samples, rollingWindows, options)`.

### Point generation

For each rolling resistance window:

1. Read window timestamp and `rMilliOhm`.
2. Drop if timestamp invalid or `rMilliOhm <= 0`.
3. Optionally drop by `minFitR2` if provided.
4. Compute cumulative discharge Ah up to that timestamp using positive current integration:
   - Uses `integrateDischargeAhUpToTimestamp`
   - Ignores non-discharge current (`current <= 0`)
   - Ignores intervals with invalid cadence (`dt > maxDtMs`, default 10,000 ms)
5. Emit point:
   - `ah`
   - `rMilliOhm`
   - `fitR2`
   - `timestamp`

Points are sorted by `ah` ascending.

### Important implementation note

Ah uses integrated positive current, not the `ampH` channel. This is intentional and explicitly documented in code assumptions.

---

## 9) Confidence for IR-vs-Ah Series

This confidence is separate from branch card confidence.

The code computes:

- `sampleCount = points.length`
- `coverageRatio = points.length / rollingWindows.length` (0 when no rolling windows)
- `assumptionScore` from average point `fitR2`:
  - `0.9` if avg R2 >= 0.8
  - `0.65` if avg R2 >= 0.5
  - `0.35` otherwise
  - `0.4` when no finite R2 values

Then `resolveMetricConfidence` applies:

- `score = clamp(coverageRatio, 0..1) * 0.6 + clamp(assumptionScore, 0..1) * 0.4`
- **high** if `sampleCount >= 20` and `score >= 0.8`
- **medium** if `sampleCount >= 8` and `score >= 0.45`
- else **low**

This series confidence is displayed below the IR-vs-Ah chart.

---

## 10) Where and How Metrics Are Displayed

## A) Battery KPI card (`BatterySectionPanel`)

Per section (Pack, Upper, Lower), "Resistance" card shows:

- `rMilliOhm` (if valid)
- `Fit R2`
- `Confidence` (high/medium/low with semantic color)
- Optional delta vs opposite branch in upper/lower sections

## B) V-I scatter + fit line (`BatteryResistanceScatterChart`)

Shows:

- Scatter points: `(current, voltage)` from selected branch
- Dashed fit line derived from:
  - `openCircuitVoltage`
  - `fitRMilliOhm` or fallback `rMilliOhm`

The fit line uses two endpoints at min and max current:

- `V_fit = V_oc - I * R`

## C) IR-vs-Ah chart (`BatteryResistanceAhChart`)

Shows:

- Scatter of rolling resistance points vs cumulative Ah
- Dashed trendline from linear regression over displayed points
- Tooltip includes:
  - Ah
  - R (mOhm)
  - point `fitR2` (if present)
  - timestamp
- Footer text: `Confidence: <series confidence>`

If fewer than 2 valid points exist, chart area shows an "insufficient rolling resistance windows" message.

## D) Metric help modal (`AnalyticsTab` battery metric map)

The help entry `resistance_vs_ah` explains:

- What the chart represents
- Caveats (rolling fit quality, Ah integration method)
- Confidence interpretation
- Formula and inputs

There are also help entries for:

- `supply_resistance_total`
- `battery_resistance`
- `resistance_delta`

---

## 11) Confidence Semantics in Practice

The code currently has two distinct confidence layers:

1. **Branch resistance confidence** (pack/lower/upper resistance cards)
   - Based directly on single full-window fit quality and data richness.
2. **IR-vs-Ah series confidence** (chart footer)
   - Based on number of retained rolling points, rolling-window coverage, and average rolling fit R2.

This means you can see combinations like:

- Medium card confidence + low IR-vs-Ah confidence (few rolling windows)
- High card confidence + medium IR-vs-Ah confidence (strong overall fit but sparse rolling yield)

---

## 12) Known Behaviors and Limitations

- Resistance is estimated from pack path behavior, not pure cell-only electrochemical impedance.
- Branch resistance includes wiring/path effects for each branch.
- Positive-current windows dominate Ah accumulation; regen intervals do not increase Ah in this chart.
- Large telemetry gaps (`dt > 10 s`) are excluded from integration and can reduce confidence.
- IR-vs-Ah trendline is descriptive over the current active window only.
- Resistance quality thresholds are currently hard-coded (not user-configurable in settings UI).

---

## 13) ΔAh/ΔSoC SoH with V_C/20

State-of-health uses an active-window capacity estimate once the window has enough voltage-derived state-of-charge movement.

For each scope (pack, lower battery, upper battery):

1. The code computes an emulated C/20 loaded voltage at the first and last valid window samples:
   - `V_C20 = V_terminal + Vp(t) + (I(t) - I_C20) * R(t)`
   - `I_C20 = C_nominal / 20`
   - `R(t)` is the rolling branch resistance, with branch resistance as fallback.
2. `V_C20` is mapped to fractional SoC with the built-in Yuasa REC36-12I C/20 lookup curve.
3. The window integrates signed Peukert-normalized amp-hours:
   - Discharge: `I_eff = I * (I / I_C20)^(k - 1)`
   - Regen/charge: `I_eff = 0.95 * I`
4. Estimated capacity and SoH are:
   - `C_actual = ΔAh_normalized / ΔSoC`
   - `SoH = C_actual / C_ideal`

The calculation is gated by `ΔSoC >= 25%`. Smaller windows show an unavailable SoH reason because SoC lookup noise is amplified in the denominator.

This differs from:

- **V_oc**: open-circuit proxy (`V_terminal + Vp + I*R`) used for zone/trend context.
- **V_C/20**: loaded terminal voltage emulated at C/20 current, used for the SoC lookup.
- **DoD**: window discharge and Peukert capacity display metrics; DoD remains available even when SoH is gated.

---

## 14) Test Coverage Relevant to IR and Confidence

`src/utils/__tests__/analyticsMetrics.spec.js` includes tests validating:

- Correct branch resistance from synthetic V-I models.
- Missing lower/upper channel handling with explicit reason codes.
- Rejection for insufficient current spread.
- IR-vs-Ah point monotonicity and timestamp alignment to rolling windows.
- Filtering of non-physical or low-quality IR-vs-Ah points.
- Low-confidence fallbacks when data is insufficient.

---

## 15) Quick Reference: Formulas

- Branch fit model: `V = V_oc - I*R`
- Resistance from fit: `R = -slope(V vs I)`
- OCV estimate (battery health KPI and trend): `V_oc ≈ V_terminal + Vp(t) + I(t)×R(t)` with per-sample RC `Vp(t)` and rolling `R(t)` (branch R fallback)
- V_C/20 estimate: `V_C20 = V_terminal + Vp(t) + (I(t) - I_C20)×R(t)`
- ΔAh/ΔSoC SoH: `SoH = ΔAh_normalized / (ΔSoC × C_ideal)`; displayed values are not capped at 100%
- Trend chart also exposes EMA-smoothed trace (`smoothedVoc`)
- IR-vs-Ah X-axis: `Ah = integral(max(I, 0) dt)` up to each rolling timestamp
- IR-vs-Ah trendline: linear regression over `(Ah, R_mOhm)` points
- Confidence score function:
  - `score = 0.6 * coverageRatio + 0.4 * assumptionScore`
  - mapped to `high/medium/low` with minimum sample-count gates

---

## 16) Display precision policy

Numeric resolution for telemetry and analytics is centralized in `src/utils/metricPrecision.js` (`METRIC_PRECISION`).

| Category | Examples | Stored / displayed resolution |
|----------|----------|-------------------------------|
| Raw telemetry | voltage, current, speed | 2 dp at display |
| Live derived | powerW, tempDiff, voltageHigh | 2 dp at derivation |
| Internal resistance | rMilliOhm, rolling IR, branch delta | 1 mΩ (integer mΩ) |
| Fit quality | R² | 2 dp |
| Cumulative energy | Wh | 2 dp |
| Estimated capacity / window Ah | discharge, Peukert, normalized C/20 | 2 dp (0.01 Ah) |
| Estimated health percentages | DoD, SoH, ΔSoC | 1 dp (0.1%) |
| Measured percentages | throttle histogram, etc. | 2 dp |

Regression and integration math use full floating-point precision internally; values are quantized only at export boundaries (analytics return objects) and in UI formatters.

