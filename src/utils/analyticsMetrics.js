/**
 * @file analyticsMetrics.js
 * @brief Derived analytics metric helpers for race telemetry.
 * @description Pure utility functions used by analytics and laps views to
 *              compute histogram, overlap, race start, acceleration and
 *              supply-resistance insights from existing telemetry packets.
 */

import { evaluateChannelThresholds, resolveThresholdSeverity } from './eventThresholds'
import { roundMetric, roundResistanceMilliOhm } from './metricPrecision'

/**
 * @brief Convert mph speed value to selected unit.
 * @param {number} mphValue - Speed in mph
 * @param {'mph'|'kph'|'ms'} speedUnit - Target speed unit
 * @returns {number} Speed converted to target unit
 */
function mphToUnit(mphValue, speedUnit) {
    if (speedUnit === 'kph') return mphValue * 1.609344
    if (speedUnit === 'ms') return mphValue * 0.44704
    return mphValue
}

/**
 * @brief Parse a value to finite number.
 * @param {unknown} value - Candidate numeric value
 * @returns {number|null} Finite number or null
 */
function toFiniteNumber(value) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
}

/**
 * @brief Check whether a sample-to-sample duration is valid.
 * @param {number} dtMs - Duration in milliseconds
 * @param {number} maxDtMs - Max allowed duration in milliseconds
 * @returns {boolean} True when duration can be trusted
 */
function isValidDuration(dtMs, maxDtMs) {
    return Number.isFinite(dtMs) && dtMs > 0 && dtMs <= maxDtMs
}

/**
 * @brief Integrate electrical energy over a sample interval.
 * @param {number|null} voltage - Voltage sample
 * @param {number|null} current - Current sample
 * @param {number} dtMs - Duration in milliseconds
 * @param {boolean} includeNegativePower - Whether to include negative power
 * @returns {number} Energy in Wh
 */
function intervalWh(voltage, current, dtMs, includeNegativePower) {
    if (voltage === null || current === null) return 0
    const powerW = voltage * current
    const adjustedPower = includeNegativePower ? powerW : Math.max(0, powerW)
    return adjustedPower * (dtMs / 3600000)
}

/**
 * @brief Build default throttle histogram bins.
 * @returns {Array<{id: string, label: string, min: number, max: number}>} Default bins
 */
function defaultThrottleBins() {
    return [
        { id: 'bin_0', label: '0%', min: 0, max: 0 },
        { id: 'bin_1_5', label: '1-5%', min: 1, max: 5 },
        { id: 'bin_6_25', label: '6-25%', min: 6, max: 25 },
        { id: 'bin_26_75', label: '26-75%', min: 26, max: 75 },
        { id: 'bin_76_99', label: '76-99%', min: 76, max: 99 },
        { id: 'bin_100', label: '100%', min: 100, max: 100 }
    ]
}

/**
 * @brief Find the matching throttle histogram bin.
 * @param {Array<{min: number, max: number}>} bins - Histogram bins
 * @param {number} throttle - Throttle value in percent
 * @returns {number} Matched bin index or -1 when no bin matches
 */
function findThrottleBinIndex(bins, throttle) {
    for (let i = 0; i < bins.length; i += 1) {
        const bin = bins[i]
        if (throttle >= bin.min && throttle <= bin.max) return i
    }
    return -1
}

/**
 * @brief Compute throttle usage histogram by time and energy.
 * @param {Array<Object>} samples - Telemetry points sorted by timestamp
 * @param {Object} [options] - Histogram options
 * @param {number} [options.maxDtMs=10000] - Max interval duration to include
 * @param {boolean} [options.includeNegativePower=false] - Include negative power intervals
 * @param {Array<Object>} [options.bins] - Custom bins (`{id,label,min,max}`)
 * @returns {Object} Histogram totals and per-bin percentages
 */
export function computeThrottleHistogram(samples, options = {}) {
    const maxDtMs = Number.isFinite(options.maxDtMs) ? options.maxDtMs : 10000
    const includeNegativePower = options.includeNegativePower === true
    const bins = Array.isArray(options.bins) && options.bins.length > 0 ? options.bins : defaultThrottleBins()

    const resultBins = bins.map((bin) => ({
        ...bin,
        timeMs: 0,
        timeSec: 0,
        timePct: 0,
        wh: 0,
        whPct: 0
    }))

    if (!Array.isArray(samples) || samples.length < 2) {
        return {
            bins: resultBins,
            totalTimeMs: 0,
            totalTimeSec: 0,
            totalWh: 0
        }
    }

    let totalTimeMs = 0
    let totalWh = 0

    for (let i = 0; i < samples.length - 1; i += 1) {
        const currentPoint = samples[i] || {}
        const nextPoint = samples[i + 1] || {}
        const ts = toFiniteNumber(currentPoint.timestamp)
        const nextTs = toFiniteNumber(nextPoint.timestamp)
        if (ts === null || nextTs === null) continue

        const dtMs = nextTs - ts
        if (!isValidDuration(dtMs, maxDtMs)) continue

        const throttle = toFiniteNumber(currentPoint.throttle)
        if (throttle === null) continue

        const binIndex = findThrottleBinIndex(resultBins, throttle)
        if (binIndex < 0) continue

        const voltage = toFiniteNumber(currentPoint.voltage)
        const current = toFiniteNumber(currentPoint.current)
        const wh = intervalWh(voltage, current, dtMs, includeNegativePower)

        resultBins[binIndex].timeMs += dtMs
        resultBins[binIndex].wh += wh
        totalTimeMs += dtMs
        totalWh += wh
    }

    resultBins.forEach((bin) => {
        bin.timeSec = bin.timeMs / 1000
        bin.timePct = totalTimeMs > 0 ? (bin.timeMs / totalTimeMs) * 100 : 0
        bin.whPct = totalWh > 0 ? (bin.wh / totalWh) * 100 : 0
    })

    return {
        bins: resultBins,
        totalTimeMs,
        totalTimeSec: totalTimeMs / 1000,
        totalWh
    }
}

/**
 * @brief Compute throttle+brake overlap events and durations.
 * @param {Array<Object>} samples - Telemetry points sorted by timestamp
 * @param {Object} [options] - Overlap options
 * @param {number} [options.maxDtMs=10000] - Max interval duration to include
 * @param {number} [options.throttleThresholdPct=5] - Minimum throttle for overlap
 * @param {number} [options.brakeThreshold=0.5] - Brake threshold for overlap
 * @param {boolean} [options.includeNegativePower=false] - Include negative overlap power
 * @returns {Object} Overlap event counters and durations
 */
export function computeThrottleBrakeOverlap(samples, options = {}) {
    const maxDtMs = Number.isFinite(options.maxDtMs) ? options.maxDtMs : 10000
    const throttleThresholdPct = Number.isFinite(options.throttleThresholdPct) ? options.throttleThresholdPct : 5
    const brakeThreshold = Number.isFinite(options.brakeThreshold) ? options.brakeThreshold : 0.5
    const includeNegativePower = options.includeNegativePower === true

    if (!Array.isArray(samples) || samples.length < 2) {
        return {
            eventCount: 0,
            totalDurationSec: 0,
            maxDurationSec: 0,
            overlapWh: 0
        }
    }

    let eventCount = 0
    let totalDurationMs = 0
    let maxDurationMs = 0
    let overlapWh = 0
    let activeEventDurationMs = 0
    let wasOverlapping = false

    for (let i = 0; i < samples.length - 1; i += 1) {
        const currentPoint = samples[i] || {}
        const nextPoint = samples[i + 1] || {}
        const ts = toFiniteNumber(currentPoint.timestamp)
        const nextTs = toFiniteNumber(nextPoint.timestamp)
        if (ts === null || nextTs === null) continue

        const dtMs = nextTs - ts
        if (!isValidDuration(dtMs, maxDtMs)) {
            if (wasOverlapping) {
                maxDurationMs = Math.max(maxDurationMs, activeEventDurationMs)
                activeEventDurationMs = 0
                wasOverlapping = false
            }
            continue
        }

        const throttle = toFiniteNumber(currentPoint.throttle)
        const brake = toFiniteNumber(currentPoint.brake)
        const isOverlapping = throttle !== null && brake !== null && throttle >= throttleThresholdPct && brake > brakeThreshold

        if (isOverlapping && !wasOverlapping) {
            eventCount += 1
        }

        if (isOverlapping) {
            const voltage = toFiniteNumber(currentPoint.voltage)
            const current = toFiniteNumber(currentPoint.current)
            totalDurationMs += dtMs
            activeEventDurationMs += dtMs
            overlapWh += intervalWh(voltage, current, dtMs, includeNegativePower)
        } else if (wasOverlapping) {
            maxDurationMs = Math.max(maxDurationMs, activeEventDurationMs)
            activeEventDurationMs = 0
        }

        wasOverlapping = isOverlapping
    }

    maxDurationMs = Math.max(maxDurationMs, activeEventDurationMs)

    return {
        eventCount,
        totalDurationSec: totalDurationMs / 1000,
        maxDurationSec: maxDurationMs / 1000,
        overlapWh
    }
}

/**
 * @brief Detect a race start timestamp from speed/current signals.
 * @param {Array<Object>} samples - Telemetry points sorted by timestamp
 * @param {Object} [options] - Start detection options
 * @param {'mph'|'kph'|'ms'} [options.speedUnit='mph'] - Speed unit in samples
 * @param {number} [options.speedThresholdMph=0.5] - Speed threshold in mph
 * @param {number} [options.startCurrentThreshold=10] - Current threshold in amps
 * @param {number} [options.sustainedSamples=2] - Required consecutive matches
 * @returns {Object} Start detection result
 */
export function detectRaceStart(samples, options = {}) {
    const speedUnit = options.speedUnit || 'mph'
    const speedThreshold = mphToUnit(
        Number.isFinite(options.speedThresholdMph) ? options.speedThresholdMph : 0.5,
        speedUnit
    )
    const startCurrentThreshold = Number.isFinite(options.startCurrentThreshold) ? options.startCurrentThreshold : 10
    const sustainedSamples = Number.isFinite(options.sustainedSamples) ? Math.max(1, Math.round(options.sustainedSamples)) : 2

    if (!Array.isArray(samples) || samples.length === 0) {
        return {
            detected: false,
            startIndex: -1,
            startTimestamp: null
        }
    }

    let streak = 0
    for (let i = 0; i < samples.length; i += 1) {
        const sample = samples[i] || {}
        const speed = toFiniteNumber(sample.speed)
        const current = toFiniteNumber(sample.current)
        const isSpeedTriggered = speed !== null && speed > speedThreshold
        const isCurrentTriggered = current !== null && current > startCurrentThreshold
        const isTriggered = isSpeedTriggered || isCurrentTriggered

        if (isTriggered) {
            streak += 1
            if (streak >= sustainedSamples) {
                const startIndex = i - sustainedSamples + 1
                const startSample = samples[startIndex] || {}
                return {
                    detected: true,
                    startIndex,
                    startTimestamp: toFiniteNumber(startSample.timestamp),
                    trigger: isSpeedTriggered ? 'speed' : 'current',
                    speedThreshold,
                    startCurrentThreshold
                }
            }
        } else {
            streak = 0
        }
    }

    return {
        detected: false,
        startIndex: -1,
        startTimestamp: null,
        speedThreshold,
        startCurrentThreshold
    }
}

/**
 * @brief Find raw and interpolated threshold crossing times.
 * @param {Array<Object>} samples - Telemetry points sorted by timestamp
 * @param {number} startIndex - Start sample index
 * @param {number} targetSpeed - Speed threshold in sample units
 * @returns {{rawSec: number|null, interpolatedSec: number|null}} Crossing times
 */
function computeSpeedCrossing(samples, startIndex, targetSpeed) {
    if (!Array.isArray(samples) || startIndex < 0 || startIndex >= samples.length) {
        return { rawSec: null, interpolatedSec: null }
    }

    const startTs = toFiniteNumber(samples[startIndex]?.timestamp)
    if (startTs === null) return { rawSec: null, interpolatedSec: null }

    let previous = null
    for (let i = startIndex; i < samples.length; i += 1) {
        const sample = samples[i] || {}
        const timestamp = toFiniteNumber(sample.timestamp)
        const speed = toFiniteNumber(sample.speed)
        if (timestamp === null || speed === null) continue

        if (speed >= targetSpeed) {
            const rawSec = (timestamp - startTs) / 1000

            if (previous && previous.speed < targetSpeed && speed > previous.speed) {
                const ratio = (targetSpeed - previous.speed) / (speed - previous.speed)
                const interpolatedTs = previous.timestamp + ratio * (timestamp - previous.timestamp)
                const interpolatedSec = (interpolatedTs - startTs) / 1000
                return { rawSec, interpolatedSec }
            }

            return { rawSec, interpolatedSec: rawSec }
        }

        previous = { speed, timestamp }
    }

    return { rawSec: null, interpolatedSec: null }
}

/**
 * @brief Rate confidence for acceleration timing derived from sparse packets.
 * @param {Array<Object>} samples - Telemetry samples
 * @param {number} startIndex - Start sample index
 * @returns {'high'|'medium'|'low'} Confidence label
 */
function rateTimingConfidence(samples, startIndex) {
    if (!Array.isArray(samples) || samples.length < 3 || startIndex < 0) return 'low'

    let dtTotal = 0
    let dtCount = 0
    for (let i = startIndex; i < samples.length - 1; i += 1) {
        const ts = toFiniteNumber(samples[i]?.timestamp)
        const nextTs = toFiniteNumber(samples[i + 1]?.timestamp)
        if (ts === null || nextTs === null) continue
        const dtMs = nextTs - ts
        if (dtMs > 0 && dtMs < 10000) {
            dtTotal += dtMs
            dtCount += 1
        }
        if (dtCount >= 6) break
    }

    if (dtCount === 0) return 'low'
    const averageDtMs = dtTotal / dtCount
    if (averageDtMs <= 1000) return 'high'
    if (averageDtMs <= 2500) return 'medium'
    return 'low'
}

/**
 * @brief Compute race start metrics from a telemetry sequence.
 * @param {Array<Object>} samples - Telemetry points sorted by timestamp
 * @param {Object} [options] - Start metric options
 * @param {'mph'|'kph'|'ms'} [options.speedUnit='mph'] - Speed unit in samples
 * @param {number} [options.startWindowMs=30000] - Window after detected start
 * @returns {Object} Race start metrics and timing details
 */
export function computeStartMetrics(samples, options = {}) {
    const speedUnit = options.speedUnit || 'mph'
    const startWindowMs = Number.isFinite(options.startWindowMs) ? options.startWindowMs : 30000
    const includeNegativePower = options.includeNegativePower === true

    const manualStartTimestamp = toFiniteNumber(options.manualStartTimestamp)
    const start = manualStartTimestamp !== null
        ? {
            detected: true,
            startIndex: Math.max(0, samples.findIndex((sample) => toFiniteNumber(sample?.timestamp) >= manualStartTimestamp)),
            startTimestamp: manualStartTimestamp
        }
        : detectRaceStart(samples, options)
    if (!start.detected || start.startIndex < 0 || start.startTimestamp === null) {
        return {
            detected: false,
            peakCurrentFirst30sA: null,
            whFirst30s: null,
            time0to10mphSec: null,
            time0to20mphSec: null,
            timingConfidence: 'low',
            disclaimer: 'Start could not be detected from available packets.'
        }
    }

    const startTs = start.startTimestamp
    const endWindowTs = startTs + startWindowMs
    let peakCurrent = null
    let whFirstWindow = 0
    const maxDtMs = Number.isFinite(options.maxDtMs) ? options.maxDtMs : 10000

    for (let i = start.startIndex; i < samples.length - 1; i += 1) {
        const currentPoint = samples[i] || {}
        const nextPoint = samples[i + 1] || {}
        const ts = toFiniteNumber(currentPoint.timestamp)
        const nextTs = toFiniteNumber(nextPoint.timestamp)
        if (ts === null || nextTs === null) continue
        if (ts >= endWindowTs) break

        const intervalStart = Math.max(ts, startTs)
        const intervalEnd = Math.min(nextTs, endWindowTs)
        const intervalDtMs = intervalEnd - intervalStart
        if (!isValidDuration(intervalDtMs, maxDtMs)) continue

        const current = toFiniteNumber(currentPoint.current)
        if (current !== null) {
            peakCurrent = peakCurrent === null ? current : Math.max(peakCurrent, current)
        }

        const voltage = toFiniteNumber(currentPoint.voltage)
        whFirstWindow += intervalWh(voltage, current, intervalDtMs, includeNegativePower)
    }

    const speed10 = mphToUnit(10, speedUnit)
    const speed20 = mphToUnit(20, speedUnit)
    const crossing10 = computeSpeedCrossing(samples, start.startIndex, speed10)
    const crossing20 = computeSpeedCrossing(samples, start.startIndex, speed20)
    const timingConfidence = rateTimingConfidence(samples, start.startIndex)

    const disclaimer = timingConfidence === 'high'
        ? 'Acceleration timing estimated from telemetry packets with interpolation.'
        : 'Acceleration timing estimated from sparse telemetry packets and may vary by sample cadence.'

    return {
        detected: true,
        startIndex: start.startIndex,
        startTimestamp: startTs,
        peakCurrentFirst30sA: peakCurrent,
        whFirst30s: whFirstWindow,
        time0to10mphSec: crossing10.interpolatedSec ?? crossing10.rawSec,
        time0to20mphSec: crossing20.interpolatedSec ?? crossing20.rawSec,
        timingConfidence,
        disclaimer,
        crossings: {
            mph10: crossing10,
            mph20: crossing20
        }
    }
}

/**
 * @brief Perform linear regression for y = a + b*x.
 * @param {number[]} xs - X values
 * @param {number[]} ys - Y values
 * @returns {{intercept: number, slope: number, r2: number}|null} Regression output
 */
function linearRegression(xs, ys) {
    if (!Array.isArray(xs) || !Array.isArray(ys) || xs.length !== ys.length || xs.length < 2) return null

    const n = xs.length
    const xMean = xs.reduce((sum, value) => sum + value, 0) / n
    const yMean = ys.reduce((sum, value) => sum + value, 0) / n

    let numerator = 0
    let denominator = 0
    for (let i = 0; i < n; i += 1) {
        const dx = xs[i] - xMean
        numerator += dx * (ys[i] - yMean)
        denominator += dx * dx
    }

    if (denominator === 0) return null
    const slope = numerator / denominator
    const intercept = yMean - slope * xMean

    let ssResidual = 0
    let ssTotal = 0
    for (let i = 0; i < n; i += 1) {
        const predicted = intercept + slope * xs[i]
        ssResidual += (ys[i] - predicted) ** 2
        ssTotal += (ys[i] - yMean) ** 2
    }

    const r2 = ssTotal > 0 ? 1 - (ssResidual / ssTotal) : 0

    return { intercept, slope, r2 }
}

/** @brief Default internal-resistance estimation tuning (overridable via analytics settings). */
const DEFAULT_IR_ESTIMATION_TUNING = Object.freeze({
    irCurrentDeadbandA: 0.5,
    irRcTauSec: 30,
    irRcResistanceScale: 0.35
})

/** @brief EMA time constant (seconds) for smoothed V_oc display on trend charts. */
const VOC_TREND_EMA_TAU_SEC = 45

/**
 * @brief Merge caller options with IR estimation defaults.
 * @param {Object} options - Caller options
 * @returns {Object} Resolved IR estimation configuration
 */
function resolveIrEstimationOptions(options = {}) {
    const minSampleCount = Number.isFinite(options.minSampleCount) ? Math.max(2, Math.round(options.minSampleCount)) : 8
    const minCurrentSpread = Number.isFinite(options.minCurrentSpread) ? options.minCurrentSpread : 5
    const rollingWindowSize = Number.isFinite(options.rollingWindowSize) ? Math.max(4, Math.round(options.rollingWindowSize)) : 12
    const rollingStep = Number.isFinite(options.rollingStep) ? Math.max(1, Math.round(options.rollingStep)) : 4
    return {
        minSampleCount,
        minCurrentSpread,
        rollingWindowSize,
        rollingStep,
        irCurrentDeadbandA: Number.isFinite(options.irCurrentDeadbandA)
            ? Math.max(0, options.irCurrentDeadbandA)
            : DEFAULT_IR_ESTIMATION_TUNING.irCurrentDeadbandA,
        irRcTauSec: Number.isFinite(options.irRcTauSec)
            ? Math.max(1, options.irRcTauSec)
            : DEFAULT_IR_ESTIMATION_TUNING.irRcTauSec,
        irRcResistanceScale: Number.isFinite(options.irRcResistanceScale)
            ? Math.max(0, Math.min(1, options.irRcResistanceScale))
            : DEFAULT_IR_ESTIMATION_TUNING.irRcResistanceScale
    }
}

/**
 * @brief Filter a V-I dataset by charge/discharge direction with a near-zero deadband.
 * @param {Array<Object>} dataset - Prepared V-I samples
 * @param {'discharge'|'charge'|'combined'} mode - Segmentation mode
 * @param {number} deadbandA - Current deadband in amps
 * @returns {Array<Object>} Filtered dataset
 */
function filterDatasetByCurrentMode(dataset, mode, deadbandA) {
    const data = Array.isArray(dataset) ? dataset : []
    if (mode === 'discharge') return data.filter((sample) => sample.current > deadbandA)
    if (mode === 'charge') return data.filter((sample) => sample.current < -deadbandA)
    return data.filter((sample) => Math.abs(sample.current) > deadbandA)
}

/**
 * @brief Compute charge/discharge purity for samples above the current deadband.
 * @param {Array<Object>} dataset - Prepared V-I samples
 * @param {number} deadbandA - Current deadband in amps
 * @returns {number} Purity ratio in [0,1]
 */
function computeModePurity(dataset, deadbandA) {
    const active = (Array.isArray(dataset) ? dataset : []).filter((sample) => Math.abs(sample.current) > deadbandA)
    if (active.length === 0) return 0
    const dischargeCount = active.filter((sample) => sample.current > deadbandA).length
    const chargeCount = active.filter((sample) => sample.current < -deadbandA).length
    return Math.max(dischargeCount, chargeCount) / active.length
}

/**
 * @brief Apply first-order RC polarization correction to terminal voltage samples.
 * @description Models slow polarization as Vp with dVp/dt = (I*Rp - Vp)/tau, then
 *              uses V_corrected = V_terminal + Vp for ohmic V-I regression.
 * @param {Array<Object>} dataset - Prepared V-I samples sorted by timestamp
 * @param {Object} tuning - IR tuning options from {@link resolveIrEstimationOptions}
 * @returns {{corrected: Array<Object>, latestPolarizationV: number|null, rOhmEstimate: number|null, rpOhmEstimate: number|null}}
 */
function applyRcDynamicCorrection(dataset, tuning) {
    const data = Array.isArray(dataset) ? dataset : []
    if (data.length === 0) {
        return { corrected: [], latestPolarizationV: null, rOhmEstimate: null, rpOhmEstimate: null }
    }

    const roughFit = linearRegression(
        data.map((sample) => sample.current),
        data.map((sample) => sample.voltage)
    )
    const rOhmEstimate = roughFit ? Math.max(0, -roughFit.slope) : 0.01

    // Skip RC correction when the raw V-I relationship is already strongly linear.
    if (roughFit && roughFit.r2 >= 0.98) {
        return {
            corrected: data.map((point) => ({
                ...point,
                polarizationV: 0,
                voltageCorrected: point.voltage
            })),
            latestPolarizationV: 0,
            rOhmEstimate,
            rpOhmEstimate: 0
        }
    }

    const rpOhmEstimate = rOhmEstimate * tuning.irRcResistanceScale
    const tauSec = tuning.irRcTauSec

    let polarizationV = 0
    const corrected = []

    for (let i = 0; i < data.length; i += 1) {
        const point = data[i]
        if (i > 0) {
            const dtSec = (point.timestamp - data[i - 1].timestamp) / 1000
            // Ignore large gaps so rest periods do not inject unrealistic polarization jumps.
            if (dtSec > 0 && dtSec <= 30) {
                const iPrev = data[i - 1].current
                polarizationV += (dtSec / tauSec) * ((iPrev * rpOhmEstimate) - polarizationV)
            }
        }
        corrected.push({
            ...point,
            polarizationV,
            voltageCorrected: point.voltage + polarizationV
        })
    }

    return {
        corrected,
        latestPolarizationV: polarizationV,
        rOhmEstimate,
        rpOhmEstimate
    }
}

/**
 * @brief Estimate overlap-adjusted effective sample count for rolling IR points.
 * @param {number} pointCount - Number of rolling points retained
 * @param {number} windowSize - Rolling window sample count
 * @param {number} step - Rolling window step
 * @returns {number} Effective independent sample estimate
 */
function computeOverlapEffectiveSampleCount(pointCount, windowSize, step) {
    if (!Number.isFinite(pointCount) || pointCount <= 1) return Math.max(0, pointCount || 0)
    const overlapRatio = windowSize > step ? (windowSize - step) / windowSize : 0
    const lag1Autocorr = Math.max(0, Math.min(0.95, overlapRatio))
    const denominator = 1 + (2 * lag1Autocorr)
    const nEff = pointCount * (1 - lag1Autocorr) / denominator
    return Math.max(1, nEff)
}

/**
 * @brief Estimate lag-1 autocorrelation for a numeric series.
 * @param {number[]} values - Numeric series
 * @returns {number|null} Lag-1 autocorrelation in [-1,1] or null
 */
function estimateLag1Autocorrelation(values) {
    if (!Array.isArray(values) || values.length < 3) return null
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length
    let numerator = 0
    let denominator = 0
    for (let i = 0; i < values.length; i += 1) {
        const delta = values[i] - mean
        denominator += delta * delta
        if (i > 0) numerator += delta * (values[i - 1] - mean)
    }
    if (denominator === 0) return null
    return numerator / denominator
}

/**
 * @brief Resolve IR chart confidence with overlap and excitation penalties.
 * @param {Object} input - Confidence inputs
 * @returns {'high'|'medium'|'low'} Confidence label
 */
function resolveIrSeriesConfidenceV2(input) {
    const {
        pointCount,
        rollingCount,
        avgFitR2,
        rollingWindowSize,
        rollingStep,
        modePurity,
        excitationScore
    } = input

    if (!Number.isFinite(pointCount) || pointCount <= 0) return 'low'

    const effectiveSampleCount = computeOverlapEffectiveSampleCount(pointCount, rollingWindowSize, rollingStep)
    const coverageRatio = rollingCount > 0 ? pointCount / rollingCount : 0
    const fitScore = Number.isFinite(avgFitR2)
        ? (avgFitR2 >= 0.8 ? 0.9 : avgFitR2 >= 0.5 ? 0.65 : 0.35)
        : 0.4
    const purityScore = Number.isFinite(modePurity) ? Math.max(0, Math.min(1, modePurity)) : 0.5
    const excitation = Number.isFinite(excitationScore) ? Math.max(0, Math.min(1, excitationScore)) : 0.5
    const assumptionScore = (fitScore * 0.55) + (purityScore * 0.25) + (excitation * 0.2)

    return resolveMetricConfidence({
        sampleCount: effectiveSampleCount,
        coverageRatio,
        assumptionScore
    })
}

/**
 * @brief Down-rank a confidence label by one step when conditions are weak.
 * @param {'high'|'medium'|'low'} confidence - Existing confidence label
 * @returns {'high'|'medium'|'low'} Adjusted confidence label
 */
function downgradeConfidence(confidence) {
    if (confidence === 'high') return 'medium'
    if (confidence === 'medium') return 'low'
    return 'low'
}

/**
 * @brief Build resistance fit dataset for the selected voltage channel.
 * @param {Array<Object>} samples - Telemetry points sorted by timestamp
 * @param {string} voltageKey - Sample voltage key to evaluate
 * @returns {Array<{timestamp: number, voltage: number, current: number}>} Filtered fit dataset
 */
function buildResistanceDataset(samples, voltageKey) {
    return (Array.isArray(samples) ? samples : [])
        .map((sample) => ({
            timestamp: toFiniteNumber(sample?.timestamp),
            voltage: toFiniteNumber(sample?.[voltageKey]),
            current: toFiniteNumber(sample?.current)
        }))
        .filter((sample) => sample.timestamp !== null && sample.voltage !== null && sample.current !== null)
}

/**
 * @brief Check if any sample contains a finite value for a given key.
 * @param {Array<Object>} samples - Telemetry points
 * @param {string} key - Sample key to inspect
 * @returns {boolean} True when at least one finite value is present
 */
function hasFiniteChannelValue(samples, key) {
    return (Array.isArray(samples) ? samples : []).some((sample) => toFiniteNumber(sample?.[key]) !== null)
}

/**
 * @brief Estimate resistance from a prepared V-I dataset for one current-direction mode.
 * @param {Array<{timestamp: number, voltage: number, current: number}>} dataset - Mode-filtered dataset
 * @param {Object} tuning - IR tuning options
 * @param {'discharge'|'charge'|'combined'} fitMode - Fit mode label
 * @returns {Object} Resistance estimate payload for the mode
 */
function estimateResistanceForMode(dataset, tuning, fitMode) {
    const { minSampleCount, minCurrentSpread, rollingWindowSize, rollingStep } = tuning

    if (dataset.length < minSampleCount) {
        return {
            valid: false,
            reason: 'insufficient_samples',
            sampleCount: dataset.length,
            fitMode
        }
    }

    const rc = applyRcDynamicCorrection(dataset, tuning)
    const corrected = rc.corrected
    const currents = corrected.map((sample) => sample.current)
    const voltages = corrected.map((sample) => sample.voltageCorrected ?? sample.voltage)
    const currentSpread = Math.max(...currents) - Math.min(...currents)

    if (currentSpread < minCurrentSpread) {
        return {
            valid: false,
            reason: 'insufficient_current_spread',
            sampleCount: corrected.length,
            currentSpread,
            fitMode
        }
    }

    const fit = linearRegression(currents, voltages)
    if (!fit) {
        return {
            valid: false,
            reason: 'fit_failed',
            sampleCount: corrected.length,
            fitMode
        }
    }

    const rOhm = -fit.slope
    if (!Number.isFinite(rOhm) || rOhm <= 0) {
        return {
            valid: false,
            reason: 'non_physical_resistance',
            sampleCount: corrected.length,
            fitR2: fit.r2,
            fitMode
        }
    }

    const rolling = []
    if (corrected.length >= rollingWindowSize) {
        for (let i = 0; i <= corrected.length - rollingWindowSize; i += rollingStep) {
            const window = corrected.slice(i, i + rollingWindowSize)
            const xs = window.map((point) => point.current)
            const ys = window.map((point) => point.voltageCorrected ?? point.voltage)
            const spread = Math.max(...xs) - Math.min(...xs)
            if (spread < minCurrentSpread) continue
            const windowFit = linearRegression(xs, ys)
            if (!windowFit) continue
            const windowROhm = -windowFit.slope
            if (!Number.isFinite(windowROhm) || windowROhm <= 0) continue
            rolling.push({
                timestamp: window[Math.floor(window.length / 2)].timestamp,
                rMilliOhm: windowROhm * 1000,
                fitR2: windowFit.r2,
                fitMode
            })
        }
    }

    let trendSlopeMilliOhmPerMin = null
    let deltaRMilliOhm = null
    if (rolling.length >= 2) {
        const x = rolling.map((point) => point.timestamp / 60000)
        const y = rolling.map((point) => point.rMilliOhm)
        const trendFit = linearRegression(x, y)
        trendSlopeMilliOhmPerMin = trendFit ? trendFit.slope : null
        deltaRMilliOhm = rolling[rolling.length - 1].rMilliOhm - rolling[0].rMilliOhm
    }

    const excitationScore = Math.min(1, currentSpread / Math.max(minCurrentSpread * 2, 1))
    let confidence = 'low'
    if (fit.r2 >= 0.8 && corrected.length >= 20 && currentSpread >= 10) confidence = 'high'
    else if (fit.r2 >= 0.5 && corrected.length >= minSampleCount) confidence = 'medium'

    const rMilliOhm = roundResistanceMilliOhm(rOhm * 1000)

    return {
        valid: true,
        sampleCount: corrected.length,
        fitR2: roundMetric(fit.r2, 'fitR2'),
        currentSpread,
        rMilliOhm,
        openCircuitVoltage: roundMetric(fit.intercept, 'voltage'),
        fitRMilliOhm: rMilliOhm,
        confidence,
        fitMode,
        excitationScore,
        rcState: {
            polarizationVoltage: rc.latestPolarizationV,
            rOhmEstimate: rc.rOhmEstimate,
            rpOhmEstimate: rc.rpOhmEstimate,
            tauSec: tuning.irRcTauSec
        },
        trend: {
            slopeMilliOhmPerMin: roundMetric(trendSlopeMilliOhmPerMin, 'resistanceSlopeMilliOhmPerMin'),
            deltaRMilliOhm: roundResistanceMilliOhm(deltaRMilliOhm)
        },
        rolling: rolling.map((point) => ({
            ...point,
            rMilliOhm: roundResistanceMilliOhm(point.rMilliOhm),
            fitR2: roundMetric(point.fitR2, 'fitR2')
        }))
    }
}

/**
 * @brief Estimate resistance from a prepared V-I dataset with mode segregation and RC correction.
 * @param {Array<{timestamp: number, voltage: number, current: number}>} filtered - Filtered fit dataset
 * @param {Object} options - Resistance estimation options
 * @returns {Object} Resistance estimate with confidence and trend
 */
function estimateSupplyResistanceFromDataset(filtered, options) {
    const tuning = resolveIrEstimationOptions(options)
    const modePurity = computeModePurity(filtered, tuning.irCurrentDeadbandA)

    const dischargeDataset = filterDatasetByCurrentMode(filtered, 'discharge', tuning.irCurrentDeadbandA)
    const chargeDataset = filterDatasetByCurrentMode(filtered, 'charge', tuning.irCurrentDeadbandA)
    const combinedDataset = filterDatasetByCurrentMode(filtered, 'combined', tuning.irCurrentDeadbandA)

    const discharge = estimateResistanceForMode(dischargeDataset, tuning, 'discharge')
    const charge = estimateResistanceForMode(chargeDataset, tuning, 'charge')
    const combined = estimateResistanceForMode(combinedDataset, tuning, 'combined')

    let primary = discharge.valid ? discharge : (charge.valid ? charge : combined)
    let selectedFitMode = discharge.valid ? 'discharge' : (charge.valid ? 'charge' : 'combined')

    if (!primary.valid) {
        return {
            ...primary,
            fitMode: selectedFitMode,
            modePurity,
            discharge,
            charge,
            combined
        }
    }

    if (selectedFitMode === 'combined' && modePurity < 0.7) {
        primary = {
            ...primary,
            confidence: downgradeConfidence(primary.confidence)
        }
    }

    return {
        ...primary,
        fitMode: selectedFitMode,
        modePurity,
        discharge,
        charge,
        combined
    }
}

/**
 * @brief Compute rolling supply resistance estimate from V-I behavior.
 * @param {Array<Object>} samples - Telemetry points sorted by timestamp
 * @param {Object} [options] - Resistance estimation options
 * @param {number} [options.minSampleCount=8] - Min sample count for fit
 * @param {number} [options.minCurrentSpread=5] - Min current spread in amps
 * @param {number} [options.rollingWindowSize=12] - Rolling window sample count
 * @param {number} [options.rollingStep=4] - Rolling window step
 * @returns {Object} Resistance estimates with branch breakdown
 */
export function computeSupplyResistance(samples, options = {}) {
    const config = resolveIrEstimationOptions(options)

    const total = estimateSupplyResistanceFromDataset(buildResistanceDataset(samples, 'voltage'), config)
    const lower = estimateSupplyResistanceFromDataset(buildResistanceDataset(samples, 'voltageLower'), config)
    const upper = estimateSupplyResistanceFromDataset(buildResistanceDataset(samples, 'voltageHigh'), config)

    if (!hasFiniteChannelValue(samples, 'voltageLower') && lower.reason === 'insufficient_samples') {
        lower.reason = 'missing_voltage_lower'
    }
    if (!hasFiniteChannelValue(samples, 'voltageHigh') && upper.reason === 'insufficient_samples') {
        upper.reason = 'missing_voltage_high'
    }

    const absDeltaMilliOhm = lower.valid && upper.valid
        ? roundResistanceMilliOhm(Math.abs(upper.rMilliOhm - lower.rMilliOhm))
        : null

    return {
        ...total,
        absDeltaMilliOhm,
        branches: {
            total,
            lower,
            upper
        }
    }
}

/**
 * @brief Compute per-channel battery power, energy, and voltage statistics.
 * @param {Array<Object>} samples - Telemetry samples sorted by timestamp
 * @param {string} voltageKey - Voltage channel key
 * @param {number} maxDtMs - Max interval duration for energy integration
 * @returns {Object} Channel battery metric summary
 */
function computeBatteryChannelMetrics(samples, voltageKey, maxDtMs) {
    const data = Array.isArray(samples) ? samples : []
    const voltageValues = []
    let latestVoltage = null
    let maxPowerW = null
    let instantaneousPowerW = null
    let dischargeWh = 0
    let regenWh = 0

    for (let i = 0; i < data.length; i += 1) {
        const sample = data[i] || {}
        const voltage = toFiniteNumber(sample?.[voltageKey])
        const current = toFiniteNumber(sample?.current)
        if (voltage !== null) {
            voltageValues.push(voltage)
            // Most recent valid voltage in window order = live terminal reading.
            latestVoltage = voltage
        }
        if (voltage === null || current === null) continue
        const powerW = voltage * current
        // Latest valid V*I in window order = instantaneous power at most recent sample.
        instantaneousPowerW = powerW
        maxPowerW = maxPowerW === null ? powerW : Math.max(maxPowerW, powerW)

        if (i >= data.length - 1) continue
        const nextSample = data[i + 1] || {}
        const ts = toFiniteNumber(sample.timestamp)
        const nextTs = toFiniteNumber(nextSample.timestamp)
        if (ts === null || nextTs === null) continue
        const dtMs = nextTs - ts
        if (!isValidDuration(dtMs, maxDtMs)) continue

        if (powerW >= 0) {
            dischargeWh += powerW * (dtMs / 3600000)
        } else {
            regenWh += Math.abs(powerW) * (dtMs / 3600000)
        }
    }

    const maxVoltage = voltageValues.length > 0 ? Math.max(...voltageValues) : null
    const minVoltage = voltageValues.length > 0 ? Math.min(...voltageValues) : null

    return {
        sampleCount: voltageValues.length,
        instantaneousPowerW: roundMetric(instantaneousPowerW, 'powerW'),
        maxPowerW: roundMetric(maxPowerW, 'powerW'),
        dischargeWh: roundMetric(dischargeWh, 'energyWh'),
        regenWh: roundMetric(regenWh, 'energyWh'),
        latestVoltage: roundMetric(latestVoltage, 'voltage'),
        maxVoltage: roundMetric(maxVoltage, 'voltage'),
        minVoltage: roundMetric(minVoltage, 'voltage'),
        avgVoltage: roundMetric(average(voltageValues), 'voltage')
    }
}

/**
 * @brief Build confidence label from sample and assumption quality factors.
 * @param {Object} input - Quality inputs
 * @param {number} input.sampleCount - Valid sample count
 * @param {number} [input.coverageRatio=0] - Valid ratio in [0,1]
 * @param {number} [input.assumptionScore=1] - Assumption quality in [0,1]
 * @returns {'high'|'medium'|'low'} Confidence label
 */
function resolveMetricConfidence({ sampleCount, coverageRatio = 0, assumptionScore = 1 }) {
    if (!Number.isFinite(sampleCount) || sampleCount <= 0) return 'low'
    const score = (Math.max(0, Math.min(1, coverageRatio)) * 0.6) + (Math.max(0, Math.min(1, assumptionScore)) * 0.4)
    if (sampleCount >= 20 && score >= 0.8) return 'high'
    if (sampleCount >= 8 && score >= 0.45) return 'medium'
    return 'low'
}

/**
 * @brief Build a standardized metric descriptor for battery health values.
 * @param {Object} config - Descriptor config
 * @param {string} config.id - Metric id
 * @param {'measured'|'model_derived_measured'|'estimated'} config.metricType - Metric class
 * @param {number|null} config.value - Metric numeric value
 * @param {'high'|'medium'|'low'} config.confidence - Confidence label
 * @param {string|null} [config.reason=null] - Confidence reason code
 * @param {string[]} [config.assumptions=[]] - Assumption list
 * @returns {Object} Standardized metric descriptor
 */
function buildBatteryMetricDescriptor(config) {
    return {
        id: config.id,
        metricType: config.metricType,
        value: Number.isFinite(config.value) ? config.value : null,
        confidence: config.confidence || 'low',
        reason: config.reason || null,
        assumptions: Array.isArray(config.assumptions) ? config.assumptions : []
    }
}

/**
 * @brief Classify combined pack voltage into a qualitative state zone.
 * @param {number|null} estimatedVoc - Estimated open-circuit voltage for zone lookup
 * @param {number} nominalSeriesVoltage - Nominal pack voltage (default 24V)
 * @param {number|null} [terminalVoltage=null] - Latest measured terminal voltage under load
 * @returns {{zone: string|null, severity: 'good'|'warning'|'critical'|null, thresholds: Object, latestVoltage: number|null, estimatedVoc: number|null}} Zone state payload
 */
function classifyVoltageZone(estimatedVoc, nominalSeriesVoltage, terminalVoltage = null) {
    const scale = nominalSeriesVoltage / 12
    const ocvThresholds = {
        highMin: 12.5 * scale,
        mediumMin: 12.0 * scale,
        lowMin: 11.2 * scale,
        cutoffMin: 9.6 * scale
    }
    const loadedThresholds = {
        healthyMin: 11.7 * scale,
        warningMin: 11.1 * scale,
        cutoffMin: 9.6 * scale,
        criticalMin: 8.0 * scale
    }
    const latestVoltage = Number.isFinite(terminalVoltage) ? terminalVoltage : null
    let loadedZone = null
    if (latestVoltage !== null) {
        if (latestVoltage >= loadedThresholds.healthyMin) loadedZone = 'healthy_load'
        else if (latestVoltage >= loadedThresholds.warningMin) loadedZone = 'warning_load'
        else if (latestVoltage >= loadedThresholds.cutoffMin) loadedZone = 'near_cutoff_load'
        else if (latestVoltage >= loadedThresholds.criticalMin) loadedZone = 'critical_load'
        else loadedZone = 'deep_discharge_load'
    }
    const base = {
        thresholds: {
            ...ocvThresholds,
            loaded: loadedThresholds
        },
        latestVoltage,
        loadedZone,
        estimatedVoc: Number.isFinite(estimatedVoc) ? estimatedVoc : null
    }
    if (!Number.isFinite(estimatedVoc)) {
        return { zone: null, severity: null, ...base }
    }
    if (estimatedVoc >= ocvThresholds.highMin) {
        return { zone: 'high', severity: 'good', ...base }
    }
    if (estimatedVoc >= ocvThresholds.mediumMin) {
        return { zone: 'medium', severity: 'warning', ...base }
    }
    if (estimatedVoc >= ocvThresholds.lowMin) {
        return { zone: 'low', severity: 'warning', ...base }
    }
    if (estimatedVoc >= ocvThresholds.cutoffMin) {
        return { zone: 'near_cutoff', severity: 'critical', ...base }
    }
    return { zone: 'deep_discharge', severity: 'critical', ...base }
}

/** @brief Minimum depth-of-discharge ratio required before SoH extrapolation is reported. */
const MIN_DOD_RATIO_FOR_SOH = 0.25

/** @brief Regen/charge coulombic efficiency applied to negative-current windows. */
const DEFAULT_REGEN_CHARGE_EFFICIENCY = 0.95

/**
 * @brief Approximate Yuasa REC36-12I C/20 voltage-to-SoC curve for one 12V block.
 * @description Points are ordered by voltage and interpolated linearly. They provide
 *              a practical C/20 lookup for analytics until a measured calibration
 *              curve is available.
 */
const YUASA_REC36_C20_SOC_CURVE = Object.freeze([
    { voltage: 10.50, soc: 0.00 },
    { voltage: 11.51, soc: 0.10 },
    { voltage: 11.66, soc: 0.20 },
    { voltage: 11.81, soc: 0.30 },
    { voltage: 11.96, soc: 0.40 },
    { voltage: 12.10, soc: 0.50 },
    { voltage: 12.24, soc: 0.60 },
    { voltage: 12.37, soc: 0.70 },
    { voltage: 12.50, soc: 0.80 },
    { voltage: 12.62, soc: 0.90 },
    { voltage: 12.73, soc: 1.00 }
])

/**
 * @brief Integrate positive discharge amp-hours from sample current.
 * @param {Array<Object>} samples - Telemetry samples sorted by timestamp
 * @param {number} maxDtMs - Max interval duration for integration
 * @returns {{dischargeAh: number, dischargeDurationHours: number, validIntervals: number}} Integration summary
 */
function integrateDischargeAhFromCurrent(samples, maxDtMs) {
    const data = Array.isArray(samples) ? samples : []
    let dischargeAh = 0
    let dischargeDurationHours = 0
    let validIntervals = 0

    for (let i = 0; i < data.length - 1; i += 1) {
        const sample = data[i] || {}
        const nextSample = data[i + 1] || {}
        const ts = toFiniteNumber(sample.timestamp)
        const nextTs = toFiniteNumber(nextSample.timestamp)
        if (ts === null || nextTs === null) continue
        const dtMs = nextTs - ts
        if (!isValidDuration(dtMs, maxDtMs)) continue
        validIntervals += 1

        const current = toFiniteNumber(sample.current)
        if (Number.isFinite(current) && current > 0) {
            dischargeAh += current * (dtMs / 3600000)
            dischargeDurationHours += dtMs / 3600000
        }
    }

    return { dischargeAh, dischargeDurationHours, validIntervals }
}

/**
 * @brief Resolve window discharge from cumulative ampH when the channel is monotonic.
 * @param {Array<Object>} samples - Telemetry samples sorted by timestamp
 * @returns {number|null} Non-negative ampH delta across the window or null
 */
function resolveAmpHWindowDischarge(samples) {
    const data = Array.isArray(samples) ? samples : []
    const points = data
        .map((sample) => ({
            timestamp: toFiniteNumber(sample?.timestamp),
            ampH: toFiniteNumber(sample?.ampH)
        }))
        .filter((point) => point.timestamp !== null && point.ampH !== null)

    if (points.length < 2) return null
    const delta = points[points.length - 1].ampH - points[0].ampH
    return Number.isFinite(delta) && delta >= 0 ? delta : null
}

/**
 * @brief Resolve discharge amp-hours for the active analytics window.
 * @param {Array<Object>} samples - Telemetry samples sorted by timestamp
 * @param {number} maxDtMs - Max interval duration for integration
 * @returns {{dischargeAh: number, dischargeDurationHours: number, validIntervals: number, source: 'current'|'ampH'}} Window discharge summary
 */
function resolveWindowDischargeAh(samples, maxDtMs) {
    const fromCurrent = integrateDischargeAhFromCurrent(samples, maxDtMs)
    const fromAmpH = resolveAmpHWindowDischarge(samples)

    if (fromAmpH !== null) {
        const alignedWithCurrent = fromCurrent.dischargeAh === 0
            || (fromAmpH <= fromCurrent.dischargeAh * 1.15 && fromAmpH >= fromCurrent.dischargeAh * 0.85)
        if (alignedWithCurrent) {
            return { ...fromCurrent, dischargeAh: fromAmpH, source: 'ampH' }
        }
    }

    return { ...fromCurrent, source: 'current' }
}

/**
 * @brief Interpolate fractional SoC from emulated C/20 voltage.
 * @param {number|null} voltage - Emulated C/20 terminal voltage for this scope
 * @param {number} nominalSeriesVoltage - Scope nominal voltage (12V branch or 24V pack)
 * @returns {number|null} Fractional SoC in [0, 1], or null for invalid voltage
 */
export function lookupYuasaC20SocFromVoltage(voltage, nominalSeriesVoltage = 12) {
    const inputVoltage = toFiniteNumber(voltage)
    const seriesVoltage = Number.isFinite(nominalSeriesVoltage) && nominalSeriesVoltage > 0
        ? nominalSeriesVoltage
        : 12
    if (inputVoltage === null) return null

    const equivalent12V = inputVoltage / (seriesVoltage / 12)
    const curve = YUASA_REC36_C20_SOC_CURVE
    if (equivalent12V <= curve[0].voltage) return curve[0].soc
    if (equivalent12V >= curve[curve.length - 1].voltage) return curve[curve.length - 1].soc

    for (let i = 1; i < curve.length; i += 1) {
        const lower = curve[i - 1]
        const upper = curve[i]
        if (equivalent12V <= upper.voltage) {
            const ratio = (equivalent12V - lower.voltage) / (upper.voltage - lower.voltage)
            return lower.soc + (ratio * (upper.soc - lower.soc))
        }
    }

    return null
}

/**
 * @brief Emulate terminal voltage at the C/20 discharge current.
 * @param {number|null} terminalVoltage - Measured terminal voltage
 * @param {number|null} current - Measured pack current in amps
 * @param {Object} options - Calculation options
 * @param {number} options.rMilliOhm - Valid rolling or branch resistance in mOhm
 * @param {number} [options.polarizationV=0] - RC polarization voltage at the sample
 * @param {number} [options.nominalCapacityAh=36] - Nominal Ah for I_C20
 * @param {boolean} [options.resistanceValid=true] - Whether IR fit is valid for this scope
 * @returns {number|null} Emulated V_C/20 terminal voltage, or null when invalid
 */
export function estimateC20TerminalVoltage(terminalVoltage, current, options = {}) {
    const voltage = toFiniteNumber(terminalVoltage)
    const currentA = toFiniteNumber(current)
    const rMilliOhm = toFiniteNumber(options.rMilliOhm)
    const resistanceValid = options.resistanceValid !== false
    const nominalCapacityAh = Number.isFinite(options.nominalCapacityAh) && options.nominalCapacityAh > 0
        ? options.nominalCapacityAh
        : 36

    if (voltage === null || currentA === null || rMilliOhm === null || rMilliOhm <= 0 || !resistanceValid) {
        return null
    }

    const iC20A = nominalCapacityAh / 20
    const polarizationV = Number.isFinite(options.polarizationV) ? options.polarizationV : 0
    const vC20 = voltage + polarizationV + ((currentA - iC20A) * (rMilliOhm / 1000))
    return Number.isFinite(vC20) ? roundMetric(vC20, 'voltage') : null
}

/**
 * @brief Integrate signed Peukert-normalized amp-hours over the active window.
 * @param {Array<Object>} samples - Telemetry samples sorted by timestamp
 * @param {Object} [options] - Integration options
 * @param {number} [options.maxDtMs=10000] - Max interval duration
 * @param {number} [options.nominalCapacityAh=36] - Nominal Ah for I_C20
 * @param {number} [options.peukertExponent=1.16] - Peukert exponent
 * @param {number} [options.chargeEfficiency=0.95] - Regen/charge coulombic efficiency
 * @returns {Object} Net/discharge/charge normalized Ah and coverage metadata
 */
export function integratePeukertNormalizedNetAh(samples, options = {}) {
    const data = Array.isArray(samples) ? samples : []
    const maxDtMs = Number.isFinite(options.maxDtMs) ? options.maxDtMs : 10000
    const nominalCapacityAh = Number.isFinite(options.nominalCapacityAh) && options.nominalCapacityAh > 0
        ? options.nominalCapacityAh
        : 36
    const peukertExponent = Number.isFinite(options.peukertExponent) ? options.peukertExponent : 1.16
    const chargeEfficiency = Number.isFinite(options.chargeEfficiency)
        ? Math.max(0, Math.min(1, options.chargeEfficiency))
        : DEFAULT_REGEN_CHARGE_EFFICIENCY
    const c20ReferenceCurrentA = nominalCapacityAh / 20

    let normalizedNetAh = 0
    let normalizedDischargeAh = 0
    let normalizedChargeAh = 0
    let validIntervals = 0

    for (let i = 0; i < data.length - 1; i += 1) {
        const sample = data[i] || {}
        const nextSample = data[i + 1] || {}
        const ts = toFiniteNumber(sample.timestamp)
        const nextTs = toFiniteNumber(nextSample.timestamp)
        if (ts === null || nextTs === null) continue
        const dtMs = nextTs - ts
        if (!isValidDuration(dtMs, maxDtMs)) continue

        const current = toFiniteNumber(sample.current)
        if (current === null) continue
        validIntervals += 1

        let effectiveCurrentA = 0
        if (current > 0 && c20ReferenceCurrentA > 0) {
            effectiveCurrentA = current * ((current / c20ReferenceCurrentA) ** (peukertExponent - 1))
            normalizedDischargeAh += effectiveCurrentA * (dtMs / 3600000)
        } else {
            effectiveCurrentA = chargeEfficiency * current
            normalizedChargeAh += Math.abs(effectiveCurrentA * (dtMs / 3600000))
        }
        normalizedNetAh += effectiveCurrentA * (dtMs / 3600000)
    }

    const possibleIntervals = Math.max(0, data.length - 1)
    return {
        normalizedNetAh,
        normalizedDischargeAh,
        normalizedChargeAh,
        validIntervals,
        coverageRatio: possibleIntervals > 0 ? validIntervals / possibleIntervals : 0,
        chargeEfficiency,
        c20ReferenceCurrentA
    }
}

/**
 * @brief Find first and last samples with voltage/current/timestamp for a scope.
 * @param {Array<Object>} samples - Telemetry samples sorted by timestamp
 * @param {string} voltageKey - Voltage channel key
 * @returns {{start: Object|null, end: Object|null}} Boundary sample pair
 */
function resolveWindowBoundarySamples(samples, voltageKey) {
    const data = Array.isArray(samples) ? samples : []
    const usable = data
        .map((sample) => ({
            sample,
            timestamp: toFiniteNumber(sample?.timestamp),
            voltage: toFiniteNumber(sample?.[voltageKey]),
            current: toFiniteNumber(sample?.current)
        }))
        .filter((entry) => entry.timestamp !== null && entry.voltage !== null && entry.current !== null)

    if (usable.length < 2) return { start: null, end: null }
    return {
        start: usable[0],
        end: usable[usable.length - 1]
    }
}

/**
 * @brief Calculate V_C/20 at a specific boundary sample.
 * @param {Object} boundary - Boundary sample payload from resolveWindowBoundarySamples
 * @param {Map<number, number>} polarizationByTimestamp - RC polarization by timestamp
 * @param {Object|null} resistanceBranch - Scope resistance estimate
 * @param {number} nominalCapacityAh - Nominal Ah for I_C20
 * @returns {number|null} Emulated V_C/20 or null
 */
function computeBoundaryVC20(boundary, polarizationByTimestamp, resistanceBranch, nominalCapacityAh) {
    if (!boundary || !resistanceBranch?.valid) return null
    const rolling = resistanceBranch?.rolling || []
    const rMilliOhm = resolveRollingResistanceMilliOhm(
        rolling,
        boundary.timestamp,
        resistanceBranch?.rMilliOhm ?? null
    )
    return estimateC20TerminalVoltage(boundary.voltage, boundary.current, {
        rMilliOhm,
        polarizationV: polarizationByTimestamp.get(boundary.timestamp) ?? 0,
        nominalCapacityAh,
        resistanceValid: resistanceBranch.valid
    })
}

/**
 * @brief Estimate SoH from Peukert-normalized Ah divided by C/20 voltage-derived delta SoC.
 * @param {Array<Object>} samples - Telemetry samples sorted by timestamp
 * @param {Object} [options] - Computation options
 * @param {string} [options.voltageKey='voltage'] - Voltage channel for this scope
 * @param {Object|null} [options.resistanceBranch] - Valid branch/pack resistance estimate
 * @param {number} [options.nominalCapacityAh=36] - Scope nominal Ah
 * @param {number} [options.nominalSeriesVoltage=12] - Scope nominal voltage
 * @param {number} [options.idealCapacityAh=36] - Static ideal Ah denominator
 * @param {number} [options.minDeltaSoc=0.25] - Minimum fractional SoC drop
 * @returns {Object} Delta-Ah/delta-SoC SoH payload
 */
export function computeDeltaAhSocWindowSoh(samples, options = {}) {
    const data = Array.isArray(samples) ? samples : []
    const voltageKey = options.voltageKey || 'voltage'
    const maxDtMs = Number.isFinite(options.maxDtMs) ? options.maxDtMs : 10000
    const nominalCapacityAh = Number.isFinite(options.nominalCapacityAh) && options.nominalCapacityAh > 0
        ? options.nominalCapacityAh
        : 36
    const nominalSeriesVoltage = Number.isFinite(options.nominalSeriesVoltage) && options.nominalSeriesVoltage > 0
        ? options.nominalSeriesVoltage
        : 12
    const idealCapacityAh = Number.isFinite(options.idealCapacityAh) && options.idealCapacityAh > 0
        ? options.idealCapacityAh
        : nominalCapacityAh
    const minDeltaSoc = Number.isFinite(options.minDeltaSoc) ? Math.max(0, options.minDeltaSoc) : MIN_DOD_RATIO_FOR_SOH
    const peukertExponent = Number.isFinite(options.peukertExponent) ? options.peukertExponent : 1.16
    const chargeEfficiency = Number.isFinite(options.chargeEfficiency)
        ? Math.max(0, Math.min(1, options.chargeEfficiency))
        : DEFAULT_REGEN_CHARGE_EFFICIENCY

    const empty = {
        sohPctValue: null,
        sohReason: 'insufficient_samples',
        sohMethod: 'delta_ah_delta_soc_vc20_window',
        vc20StartV: null,
        vc20EndV: null,
        socStart: null,
        socEnd: null,
        deltaSoc: null,
        normalizedWindowAh: null,
        estimatedActualCapacityAh: null,
        normalizedDischargeAh: null,
        normalizedChargeAh: null,
        validIntervals: 0,
        coverageRatio: 0,
        chargeEfficiency
    }

    if (data.length < 2) return empty
    if (!options.resistanceBranch?.valid) {
        return { ...empty, sohReason: 'missing_valid_resistance_fit' }
    }

    const boundaries = resolveWindowBoundarySamples(data, voltageKey)
    if (!boundaries.start || !boundaries.end) {
        return { ...empty, sohReason: 'missing_vc20_boundary' }
    }

    const tuning = resolveIrEstimationOptions(options)
    const polarizationByTimestamp = buildPolarizationByTimestamp(data, voltageKey, tuning)
    const vc20StartV = computeBoundaryVC20(
        boundaries.start,
        polarizationByTimestamp,
        options.resistanceBranch,
        nominalCapacityAh
    )
    const vc20EndV = computeBoundaryVC20(
        boundaries.end,
        polarizationByTimestamp,
        options.resistanceBranch,
        nominalCapacityAh
    )

    if (!Number.isFinite(vc20StartV) || !Number.isFinite(vc20EndV)) {
        return { ...empty, sohReason: 'missing_vc20_boundary', vc20StartV, vc20EndV }
    }

    const socStart = lookupYuasaC20SocFromVoltage(vc20StartV, nominalSeriesVoltage)
    const socEnd = lookupYuasaC20SocFromVoltage(vc20EndV, nominalSeriesVoltage)
    if (!Number.isFinite(socStart) || !Number.isFinite(socEnd)) {
        return { ...empty, sohReason: 'invalid_soc_lookup', vc20StartV, vc20EndV, socStart, socEnd }
    }

    const deltaSoc = socStart - socEnd
    const normalizedAh = integratePeukertNormalizedNetAh(data, {
        maxDtMs,
        nominalCapacityAh,
        peukertExponent,
        chargeEfficiency
    })

    const base = {
        ...empty,
        vc20StartV,
        vc20EndV,
        socStart,
        socEnd,
        deltaSoc,
        normalizedWindowAh: Number.isFinite(normalizedAh.normalizedNetAh)
            ? roundMetric(normalizedAh.normalizedNetAh, 'peukertAh')
            : null,
        normalizedDischargeAh: Number.isFinite(normalizedAh.normalizedDischargeAh)
            ? roundMetric(normalizedAh.normalizedDischargeAh, 'peukertAh')
            : null,
        normalizedChargeAh: Number.isFinite(normalizedAh.normalizedChargeAh)
            ? roundMetric(normalizedAh.normalizedChargeAh, 'peukertAh')
            : null,
        validIntervals: normalizedAh.validIntervals,
        coverageRatio: normalizedAh.coverageRatio,
        chargeEfficiency: normalizedAh.chargeEfficiency
    }

    if (normalizedAh.coverageRatio < 0.5 || normalizedAh.validIntervals === 0) {
        return { ...base, sohReason: 'insufficient_window_coverage' }
    }
    if (!Number.isFinite(deltaSoc) || deltaSoc < minDeltaSoc) {
        return { ...base, sohReason: 'insufficient_delta_soc' }
    }
    if (!Number.isFinite(normalizedAh.normalizedNetAh) || normalizedAh.normalizedNetAh <= 0) {
        return { ...base, sohReason: 'non_positive_normalized_delta_ah' }
    }

    const estimatedActualCapacityAh = roundMetric(normalizedAh.normalizedNetAh / deltaSoc, 'peukertAh')
    const sohPctValue = roundMetric((estimatedActualCapacityAh / idealCapacityAh) * 100, 'estimatedPercent')

    return {
        ...base,
        estimatedActualCapacityAh,
        sohPctValue,
        sohReason: null
    }
}

/**
 * @brief Detect contiguous discharge segments and return the primary (largest Ah) cycle.
 * @param {Array<Object>} samples - Telemetry samples sorted by timestamp
 * @param {number} maxDtMs - Max interval duration for integration
 * @param {number} [irCurrentDeadbandA=0] - Minimum positive current treated as discharge
 * @returns {Object|null} Primary segment summary or null when no discharge
 */
function detectPrimaryDischargeSegment(samples, maxDtMs, irCurrentDeadbandA = 0) {
    const data = Array.isArray(samples) ? samples : []
    const deadband = Number.isFinite(irCurrentDeadbandA) ? irCurrentDeadbandA : 0
    const segments = []
    let segmentSamples = []

    const flushSegment = () => {
        if (segmentSamples.length < 2) {
            segmentSamples = []
            return
        }
        const integration = integrateDischargeAhFromCurrent(segmentSamples, maxDtMs)
        if (integration.dischargeAh > 0) {
            segments.push({
                dischargeAh: integration.dischargeAh,
                dischargeDurationHours: integration.dischargeDurationHours,
                validIntervals: integration.validIntervals,
                startMs: toFiniteNumber(segmentSamples[0]?.timestamp),
                endMs: toFiniteNumber(segmentSamples[segmentSamples.length - 1]?.timestamp)
            })
        }
        segmentSamples = []
    }

    for (let i = 0; i < data.length; i += 1) {
        const sample = data[i] || {}
        const current = toFiniteNumber(sample.current)
        const isDischarging = Number.isFinite(current) && current > deadband

        if (isDischarging) {
            if (segmentSamples.length > 0) {
                const prevTs = toFiniteNumber(segmentSamples[segmentSamples.length - 1]?.timestamp)
                const ts = toFiniteNumber(sample.timestamp)
                const dtMs = prevTs !== null && ts !== null ? ts - prevTs : null
                if (!isValidDuration(dtMs, maxDtMs)) {
                    flushSegment()
                }
            }
            segmentSamples.push(sample)
        } else {
            flushSegment()
        }
    }
    flushSegment()

    if (segments.length === 0) return null

    segments.sort((a, b) => {
        if (b.dischargeAh !== a.dischargeAh) return b.dischargeAh - a.dischargeAh
        const durationA = Number.isFinite(a.endMs) && Number.isFinite(a.startMs) ? a.endMs - a.startMs : 0
        const durationB = Number.isFinite(b.endMs) && Number.isFinite(b.startMs) ? b.endMs - b.startMs : 0
        return durationB - durationA
    })
    return segments[0]
}

/**
 * @brief Peukert-normalize the primary discharge cycle to C/20 equivalent Ah for SoH and DoD.
 * @param {Array<Object>} samples - Telemetry samples sorted by timestamp
 * @param {Object} [options] - Computation options
 * @param {number} [options.maxDtMs=10000] - Max interval duration for integration
 * @param {number} [options.nominalCapacityAh=36] - Nominal Ah (anchors I_C20 only)
 * @param {number} [options.peukertExponent=1.16] - Peukert exponent k
 * @param {number|null} [options.idealCapacityAh] - Static C_ideal for SoH / normalized DoD %
 * @param {number} [options.minDepthRatio=0.25] - Minimum Ah_dis/C_ideal before SoH is reported
 * @param {number} [options.irCurrentDeadbandA=0] - Discharge current deadband
 * @returns {Object} Cycle metrics, normalized Ah, DoD %, and SoH inputs
 */
export function computeDischargeCyclePeukertMetrics(samples, options = {}) {
    const maxDtMs = Number.isFinite(options.maxDtMs) ? options.maxDtMs : 10000
    const nominalCapacityAh = Number.isFinite(options.nominalCapacityAh) && options.nominalCapacityAh > 0
        ? options.nominalCapacityAh
        : 36
    const peukertExponent = Number.isFinite(options.peukertExponent) ? options.peukertExponent : 1.16
    const configuredIdeal = Number.isFinite(options.idealCapacityAh) && options.idealCapacityAh > 0
        ? options.idealCapacityAh
        : null
    const idealCapacityAh = configuredIdeal !== null ? configuredIdeal : nominalCapacityAh
    const minDepthRatio = Number.isFinite(options.minDepthRatio) ? options.minDepthRatio : MIN_DOD_RATIO_FOR_SOH
    const irCurrentDeadbandA = Number.isFinite(options.irCurrentDeadbandA) ? options.irCurrentDeadbandA : 0
    const c20ReferenceCurrentA = nominalCapacityAh / 20

    const empty = {
        cycleDischargeAh: null,
        cycleAvgCurrentA: null,
        normalizedC20DischargeAh: null,
        c20ReferenceCurrentA,
        normalizedC20DodPct: null,
        normalizedC20DodVsNominalPct: null,
        validIntervals: 0,
        segmentStartMs: null,
        segmentEndMs: null,
        sohPctValue: null,
        sohReason: 'insufficient_samples',
        deepCycleRatio: null
    }

    const data = Array.isArray(samples) ? samples : []
    if (data.length < 2) return empty

    const primary = detectPrimaryDischargeSegment(data, maxDtMs, irCurrentDeadbandA)
    if (!primary || primary.dischargeAh <= 0) {
        return { ...empty, sohReason: 'no_discharge_cycle' }
    }

    const cycleAvgCurrentA = primary.dischargeDurationHours > 0
        ? primary.dischargeAh / primary.dischargeDurationHours
        : null
    let normalizedC20DischargeAh = null
    if (Number.isFinite(cycleAvgCurrentA) && cycleAvgCurrentA > 0 && c20ReferenceCurrentA > 0) {
        // Scale measured cycle Ah at I_avg to C/20-equivalent yield: Ah_norm = Ah_dis × (I_avg/I_C20)^(k−1)
        normalizedC20DischargeAh = primary.dischargeAh * ((cycleAvgCurrentA / c20ReferenceCurrentA) ** (peukertExponent - 1))
    }

    let normalizedC20DodPct = null
    let normalizedC20DodVsNominalPct = null
    if (Number.isFinite(normalizedC20DischargeAh) && idealCapacityAh > 0) {
        normalizedC20DodPct = (normalizedC20DischargeAh / idealCapacityAh) * 100
    }
    if (Number.isFinite(normalizedC20DischargeAh) && nominalCapacityAh > 0) {
        normalizedC20DodVsNominalPct = (normalizedC20DischargeAh / nominalCapacityAh) * 100
    }

    const deepCycleRatio = idealCapacityAh > 0 ? primary.dischargeAh / idealCapacityAh : null
    let sohPctValue = null
    let sohReason = 'no_discharge_cycle'
    if (!(idealCapacityAh > 0)) {
        sohReason = 'insufficient_ideal_capacity'
    } else if (!Number.isFinite(deepCycleRatio) || deepCycleRatio < minDepthRatio) {
        sohReason = 'insufficient_cycle_depth'
    } else if (Number.isFinite(normalizedC20DodPct)) {
        sohPctValue = normalizedC20DodPct
        sohReason = null
    } else {
        sohReason = 'insufficient_normalization'
    }

    return {
        cycleDischargeAh: primary.dischargeAh,
        cycleAvgCurrentA,
        normalizedC20DischargeAh,
        c20ReferenceCurrentA,
        normalizedC20DodPct,
        normalizedC20DodVsNominalPct,
        validIntervals: primary.validIntervals,
        segmentStartMs: primary.startMs,
        segmentEndMs: primary.endMs,
        sohPctValue,
        sohReason,
        deepCycleRatio
    }
}

/**
 * @brief Attach discharge-cycle fields and build SoH descriptor from precomputed cycle metrics.
 * @param {Object} health - Health payload from computeBatteryHealthMetrics
 * @param {Object} cycleMetrics - Output from computeDischargeCyclePeukertMetrics
 * @param {Object} context - Descriptor context
 * @param {string} context.scopeLabel - Human-readable scope label
 * @param {string} context.confidence - SoH confidence tier
 * @returns {Object} Health payload with cycle fields and SoH
 */
function mergeDischargeCycleIntoHealth(health, cycleMetrics, context) {
    const {
        scopeLabel,
        confidence,
        sohMetrics = null,
        windowPeukertMetrics = null,
        idealCapacityAh = null,
        nominalCapacityAh = null
    } = context
    const cycle = cycleMetrics || {}
    const soh = sohMetrics || cycle
    // Full-window per-sample Peukert integration (same basis as SoH ΔAh); not the primary-cycle I_avg shortcut.
    const windowNormalizedDischargeAh = Number.isFinite(windowPeukertMetrics?.normalizedDischargeAh)
        && windowPeukertMetrics.normalizedDischargeAh > 0
        ? roundMetric(windowPeukertMetrics.normalizedDischargeAh, 'peukertAh')
        : null
    const cycleNormalizedDischargeAh = Number.isFinite(cycle.normalizedC20DischargeAh)
        ? roundMetric(cycle.normalizedC20DischargeAh, 'peukertAh')
        : null
    const normalizedC20DischargeAh = windowNormalizedDischargeAh ?? cycleNormalizedDischargeAh ?? null
    let normalizedC20DodPct = null
    let normalizedC20DodVsNominalPct = null
    if (Number.isFinite(normalizedC20DischargeAh)) {
        if (Number.isFinite(idealCapacityAh) && idealCapacityAh > 0) {
            normalizedC20DodPct = roundMetric((normalizedC20DischargeAh / idealCapacityAh) * 100, 'estimatedPercent')
        }
        if (Number.isFinite(nominalCapacityAh) && nominalCapacityAh > 0) {
            normalizedC20DodVsNominalPct = roundMetric((normalizedC20DischargeAh / nominalCapacityAh) * 100, 'estimatedPercent')
        }
    }
    const sohAssumptions = sohMetrics
        ? [
            'SoH uses the ΔAh/ΔSoC active-window method with emulated V_C/20 at the window boundaries.',
            'ΔAh is signed Peukert-normalized net Ah; ΔSoC comes from the Yuasa C/20 voltage lookup.',
            'SoH is reported only when ΔSoC is at least 25% to reduce denominator noise.',
            `Scoped to ${scopeLabel}.`
        ]
        : [
            'SoH compares Peukert-normalized cycle discharge to ideal capacity from Settings.',
            'Ah_norm = Ah_dis × (I_avg/I_C20)^(k−1); I_C20 = C_nominal/20.',
            'Primary discharge cycle is the segment with the largest integrated Ah in the window.',
            `Scoped to ${scopeLabel}.`
        ]
    if (!sohMetrics && cycle.sohReason === 'insufficient_cycle_depth' && Number.isFinite(cycle.deepCycleRatio)) {
        sohAssumptions.push(`Cycle depth ${(cycle.deepCycleRatio * 100).toFixed(1)}% of ideal capacity is below the minimum for SoH.`)
    }
    if (sohMetrics && soh.sohReason === 'insufficient_delta_soc' && Number.isFinite(soh.deltaSoc)) {
        sohAssumptions.push(`Window ΔSoC ${(soh.deltaSoc * 100).toFixed(1)}% is below the 25.0% minimum.`)
    }

    return {
        ...health,
        cycleDischargeAh: cycle.cycleDischargeAh ?? null,
        cycleAvgCurrentA: cycle.cycleAvgCurrentA ?? null,
        normalizedC20DischargeAh,
        c20ReferenceCurrentA: windowPeukertMetrics?.c20ReferenceCurrentA ?? cycle.c20ReferenceCurrentA ?? null,
        normalizedC20DodPct,
        normalizedC20DodVsNominalPct,
        dischargeCycleNormalizedC20DischargeAh: cycle.normalizedC20DischargeAh ?? null,
        dischargeCycleSegmentStartMs: cycle.segmentStartMs ?? null,
        dischargeCycleSegmentEndMs: cycle.segmentEndMs ?? null,
        vc20StartV: sohMetrics?.vc20StartV ?? null,
        vc20EndV: sohMetrics?.vc20EndV ?? null,
        socStart: sohMetrics?.socStart ?? null,
        socEnd: sohMetrics?.socEnd ?? null,
        deltaSoc: sohMetrics?.deltaSoc ?? null,
        normalizedWindowAh: sohMetrics?.normalizedWindowAh ?? null,
        estimatedActualCapacityAh: sohMetrics?.estimatedActualCapacityAh ?? null,
        sohMethod: sohMetrics?.sohMethod ?? null,
        soh: buildBatteryMetricDescriptor({
            id: 'sohPct',
            metricType: 'estimated',
            value: soh.sohPctValue ?? null,
            confidence,
            reason: Number.isFinite(soh.sohPctValue) ? null : (soh.sohReason ?? 'no_discharge_cycle'),
            assumptions: sohAssumptions
        })
    }
}

/**
 * @brief Build DoD, Peukert, and SoH descriptors for a pack or single-battery scope.
 * @param {Object} input - Capacity metric inputs
 * @param {number} input.dischargeAh - Window discharge amp-hours
 * @param {number|null} input.avgDischargeCurrentA - Average discharge current in the window
 * @param {number} input.nominalCapacityAh - Nominal amp-hour capacity for this scope
 * @param {number} input.peukertExponent - Peukert exponent
 * @param {number} input.validIntervals - Trusted integration intervals
 * @param {number} input.dodCoverage - Ratio of trusted intervals in the window
 * @param {string} input.scopeLabel - Human-readable scope label (pack or battery name)
 * @param {'current'|'ampH'} input.dischargeSource - Discharge integration source
 * @returns {{dodPct: Object, peukert: Object, rawDodPct: number|null, dodBasis: string}} Capacity health descriptors (SoH from discharge cycle helper)
 */
function buildCapacityHealthBlock(input) {
    const {
        dischargeAh,
        avgDischargeCurrentA,
        nominalCapacityAh,
        peukertExponent,
        validIntervals,
        dodCoverage,
        scopeLabel,
        dischargeSource,
        actualCapacityAh: configuredActualCapacityAh = null
    } = input

    const nominalDodPct = nominalCapacityAh > 0 && dischargeAh > 0
        ? (dischargeAh / nominalCapacityAh) * 100
        : null
    const dodExceedsNominal = Number.isFinite(nominalDodPct) && nominalDodPct > 100
    const deepDischargeRatio = nominalCapacityAh > 0 ? dischargeAh / nominalCapacityAh : 0

    let actualCapacityAh = Number.isFinite(configuredActualCapacityAh) && configuredActualCapacityAh > 0
        ? configuredActualCapacityAh
        : null
    let actualCapacitySource = actualCapacityAh !== null ? 'configured_actual_capacity' : 'unavailable'
    if (actualCapacityAh === null && dischargeAh > 0 && deepDischargeRatio >= 0.95) {
        actualCapacityAh = dischargeAh
        actualCapacitySource = 'window_full_discharge'
    }

    const referenceCurrentA = nominalCapacityAh / 20
    const peukertCapacityConstant = nominalCapacityAh > 0 && referenceCurrentA > 0
        ? nominalCapacityAh * (referenceCurrentA ** (peukertExponent - 1))
        : null
    const expectedCapacityAh = Number.isFinite(avgDischargeCurrentA) && avgDischargeCurrentA > 0
        ? peukertCapacityConstant / (avgDischargeCurrentA ** (peukertExponent - 1))
        : null

    const roundedDischargeAh = dischargeAh > 0 ? roundMetric(dischargeAh, 'peukertAh') : 0
    const roundedExpectedCapacityAh = Number.isFinite(expectedCapacityAh)
        ? roundMetric(expectedCapacityAh, 'peukertAh')
        : null
    const roundedActualCapacityAh = Number.isFinite(actualCapacityAh)
        ? roundMetric(actualCapacityAh, 'peukertAh')
        : null

    let dodPctValue = null
    let dodBasis = 'nominal_fallback'
    if (Number.isFinite(roundedExpectedCapacityAh) && roundedExpectedCapacityAh > 0) {
        dodPctValue = roundMetric((roundedDischargeAh / roundedExpectedCapacityAh) * 100, 'estimatedPercent')
        dodBasis = 'peukert_capacity'
    } else if (Number.isFinite(roundedActualCapacityAh) && roundedActualCapacityAh > 0) {
        dodPctValue = roundMetric((roundedDischargeAh / roundedActualCapacityAh) * 100, 'estimatedPercent')
        dodBasis = 'actual_capacity'
    } else if (Number.isFinite(nominalDodPct)) {
        dodPctValue = roundMetric(nominalDodPct, 'estimatedPercent')
    }

    const dodConfidence = dodBasis === 'peukert_capacity'
        ? null
        : resolveMetricConfidence({
            sampleCount: validIntervals,
            coverageRatio: dodCoverage,
            assumptionScore: dodBasis === 'actual_capacity'
                ? (dischargeSource === 'ampH' ? 0.9 : 0.8)
                : (dischargeSource === 'ampH' ? 0.65 : 0.55)
        })

    const peukertAssumptionScore = deepDischargeRatio >= 0.5
        ? 0.85
        : deepDischargeRatio >= MIN_DOD_RATIO_FOR_SOH
            ? 0.6
            : 0.3
    const peukertConfidence = resolveMetricConfidence({
        sampleCount: validIntervals,
        coverageRatio: dodCoverage,
        assumptionScore: peukertAssumptionScore
    })
    const resolvedDodConfidence = dodBasis === 'peukert_capacity' ? peukertConfidence : dodConfidence

    const dodExceedsPeukert = dodBasis === 'peukert_capacity'
        && Number.isFinite(dodPctValue)
        && dodPctValue > 100

    const dodAssumptions = [
        dodBasis === 'peukert_capacity'
            ? `DoD% = window discharge / Peukert capacity at average discharge current for ${scopeLabel}.`
            : dodBasis === 'actual_capacity'
                ? `DoD denominator uses ideal capacity fallback for ${scopeLabel} (Peukert capacity unavailable).`
                : `DoD denominator uses nominal capacity fallback for ${scopeLabel}.`,
        `Nominal capacity for ${scopeLabel} configured at ${nominalCapacityAh.toFixed(1)} Ah.`,
        dischargeSource === 'ampH'
            ? 'Discharge prefers cumulative ampH delta when aligned with current integration.'
            : 'Discharge integrated from positive current samples.'
    ]
    if (dodBasis === 'peukert_capacity' && Number.isFinite(expectedCapacityAh)) {
        dodAssumptions.push(`Peukert capacity at I_avg=${avgDischargeCurrentA.toFixed(2)} A is ${expectedCapacityAh.toFixed(2)} Ah.`)
    }
    if (dodBasis === 'actual_capacity') {
        dodAssumptions.push(`Ideal capacity source: ${actualCapacitySource.replace(/_/g, ' ')}.`)
    }
    if (dodExceedsNominal) {
        dodAssumptions.push(`Window discharge is ${nominalDodPct.toFixed(1)}% of configured nominal capacity.`)
    }
    if (dodExceedsPeukert) {
        dodAssumptions.push(`Window discharge exceeds Peukert capacity at the window average current.`)
    }

    let dodReason = null
    if (!Number.isFinite(dodPctValue)) {
        dodReason = 'insufficient_discharge_window'
    } else if (dodExceedsPeukert) {
        dodReason = 'window_exceeds_peukert_capacity'
    } else if (dodBasis === 'nominal_fallback') {
        dodReason = 'missing_peukert_and_ideal_fallback_nominal'
    } else if (dodBasis === 'actual_capacity' && dodExceedsNominal) {
        dodReason = 'window_exceeds_nominal_capacity'
    }

    return {
        dodPct: buildBatteryMetricDescriptor({
            id: 'dodPct',
            metricType: 'estimated',
            value: dodPctValue,
            confidence: resolvedDodConfidence,
            reason: dodReason,
            assumptions: dodAssumptions
        }),
        peukert: {
            exponent: peukertExponent,
            capacityConstant: peukertCapacityConstant,
            expectedCapacityAh: roundedExpectedCapacityAh,
            windowDischargeAh: roundedDischargeAh > 0 ? roundedDischargeAh : null,
            estimatedActualCapacityAh: roundedActualCapacityAh,
            actualCapacitySource,
            referenceCurrentA,
            descriptor: buildBatteryMetricDescriptor({
                id: 'peukert_expected_capacity',
                metricType: 'estimated',
                value: roundedExpectedCapacityAh,
                confidence: peukertConfidence,
                reason: Number.isFinite(expectedCapacityAh) ? null : 'insufficient_discharge_window',
                assumptions: [
                    `Peukert model scoped to ${scopeLabel} (${nominalCapacityAh.toFixed(1)} Ah nominal).`,
                    `Peukert exponent fixed at ${peukertExponent.toFixed(3)}.`,
                    'Reference form uses t = Cp / I^k and capacity C(I) = Cp / I^(k-1).',
                    'Reference current uses C/20 convention to anchor Cp from configured nominal capacity.'
                ]
            })
        },
        rawDodPct: Number.isFinite(nominalDodPct) ? roundMetric(nominalDodPct, 'estimatedPercent') : null,
        dodExceedsNominal,
        deepDischargeRatio,
        actualCapacityAh: roundedActualCapacityAh,
        actualCapacitySource,
        dodBasis
    }
}

/**
 * @brief Resolve latest battery voltage/current pair from telemetry samples.
 * @param {Array<Object>} samples - Telemetry samples sorted by timestamp
 * @param {string} voltageKey - Battery voltage channel key
 * @returns {{voltage: number, current: number|null}|null} Latest battery sample or null
 */
function getLatestBatterySample(samples, voltageKey) {
    const data = Array.isArray(samples) ? samples : []
    for (let i = data.length - 1; i >= 0; i -= 1) {
        const voltage = toFiniteNumber(data[i]?.[voltageKey])
        const current = toFiniteNumber(data[i]?.current)
        if (voltage !== null && current !== null) {
            return {
                voltage,
                current,
                timestamp: toFiniteNumber(data[i]?.timestamp)
            }
        }
    }
    for (let i = data.length - 1; i >= 0; i -= 1) {
        const voltage = toFiniteNumber(data[i]?.[voltageKey])
        if (voltage !== null) {
            return {
                voltage,
                current: null,
                timestamp: toFiniteNumber(data[i]?.timestamp)
            }
        }
    }
    return null
}

/**
 * @brief Resolve rolling resistance (mΩ) at a timestamp from rolling IR windows.
 * @description Uses the latest rolling point at or before the sample time; falls back to branch R.
 * @param {Array<{timestamp: number, rMilliOhm: number}>} rolling - Rolling resistance points sorted by time
 * @param {number} timestamp - Sample timestamp in ms
 * @param {number|null} fallbackRMilliOhm - Branch-level R when no rolling point applies yet
 * @returns {number|null} Resistance in mΩ or null
 */
function resolveRollingResistanceMilliOhm(rolling, timestamp, fallbackRMilliOhm) {
    if (!Number.isFinite(timestamp)) {
        return Number.isFinite(fallbackRMilliOhm) ? fallbackRMilliOhm : null
    }

    const windows = Array.isArray(rolling) ? rolling : []
    let resolved = null

    for (let i = 0; i < windows.length; i += 1) {
        const entryTs = toFiniteNumber(windows[i]?.timestamp)
        const entryR = toFiniteNumber(windows[i]?.rMilliOhm)
        if (entryTs === null || entryR === null || entryR <= 0) continue
        if (entryTs > timestamp) break
        resolved = entryR
    }

    if (resolved !== null) return resolved

    const firstR = toFiniteNumber(windows[0]?.rMilliOhm)
    if (firstR !== null && firstR > 0) return firstR

    return Number.isFinite(fallbackRMilliOhm) ? fallbackRMilliOhm : null
}

/**
 * @brief Build per-timestamp RC polarization voltage from the same model used in IR fitting.
 * @param {Array<Object>} samples - Telemetry samples sorted by timestamp
 * @param {string} voltageKey - Terminal voltage channel for this branch
 * @param {Object} tuning - IR tuning from {@link resolveIrEstimationOptions}
 * @returns {Map<number, number>} Timestamp to polarization voltage (V)
 */
function buildPolarizationByTimestamp(samples, voltageKey, tuning) {
    const rc = applyRcDynamicCorrection(buildResistanceDataset(samples, voltageKey), tuning)
    const map = new Map()
    for (const point of rc.corrected) {
        const ts = toFiniteNumber(point?.timestamp)
        const vp = toFiniteNumber(point?.polarizationV)
        if (ts !== null && vp !== null) map.set(ts, vp)
    }
    return map
}

/**
 * @brief Resolve per-sample V_oc proxy inputs (Vp and rolling R) for a branch.
 * @param {Array<Object>} samples - Telemetry samples sorted by timestamp
 * @param {string} voltageKey - Terminal voltage channel
 * @param {Object|null} resistanceBranch - Branch resistance estimate with rolling windows
 * @param {number|null} timestamp - Sample timestamp in ms
 * @param {Object} [vocOptions] - IR tuning options
 * @returns {{polarizationV: number, rMilliOhm: number|null}} Sample context for V_oc proxy
 */
function buildVocSampleContext(samples, voltageKey, resistanceBranch, timestamp, vocOptions = {}) {
    const tuning = resolveIrEstimationOptions(vocOptions)
    const polarizationByTimestamp = buildPolarizationByTimestamp(samples, voltageKey, tuning)
    const polarizationV = Number.isFinite(timestamp) && polarizationByTimestamp.has(timestamp)
        ? polarizationByTimestamp.get(timestamp)
        : 0
    const rMilliOhm = resolveRollingResistanceMilliOhm(
        resistanceBranch?.rolling || [],
        timestamp,
        resistanceBranch?.rMilliOhm ?? null
    )

    return { polarizationV, rMilliOhm }
}

/**
 * @brief Resolve latest terminal voltage/current pair from telemetry samples.
 * @param {Array<Object>} samples - Telemetry samples sorted by timestamp
 * @returns {{voltage: number, current: number}|null} Latest terminal sample or null
 */
function getLatestTerminalSample(samples) {
    const data = Array.isArray(samples) ? samples : []
    for (let i = data.length - 1; i >= 0; i -= 1) {
        const voltage = toFiniteNumber(data[i]?.voltage)
        const current = toFiniteNumber(data[i]?.current)
        if (voltage !== null && current !== null) {
            return { voltage, current }
        }
    }
    for (let i = data.length - 1; i >= 0; i -= 1) {
        const voltage = toFiniteNumber(data[i]?.voltage)
        if (voltage !== null) return { voltage, current: null }
    }
    return null
}

/**
 * @brief Estimate open-circuit voltage from terminal voltage and current using fitted resistance.
 * @description Uses V_terminal = V_oc - I*R, so V_oc = V_terminal + I*R.
 * @param {number|null} terminalVoltage - Measured terminal voltage
 * @param {number|null} current - Branch current in amps
 * @param {Object|null} resistanceBranch - Combined resistance estimate branch
 * @returns {number|null} Estimated open-circuit voltage or null
 */
function estimateOpenCircuitVoltage(terminalVoltage, current, resistanceBranch) {
    const proxy = estimateOpenCircuitVoltageProxy(terminalVoltage, current, resistanceBranch)
    return proxy?.value ?? null
}

/**
 * @brief Estimate instantaneous open-circuit voltage using per-sample Vp and rolling R.
 * @description V_oc ≈ V_terminal + Vp(t) + I(t)*R(t). Always applies ohmic correction when R is valid.
 * @param {number|null} terminalVoltage - Measured terminal voltage
 * @param {number|null} current - Branch current in amps
 * @param {Object|null} resistanceBranch - Resistance branch metadata (validity, confidence)
 * @param {Object} sampleContext - Per-sample proxy inputs
 * @param {number} [sampleContext.polarizationV=0] - RC polarization at this timestamp (V)
 * @param {number|null} [sampleContext.rMilliOhm] - Rolling or branch resistance (mΩ)
 * @param {Object} [options] - Proxy options
 * @param {number} [options.irCurrentDeadbandA] - Near-zero current threshold for quality labeling only
 * @returns {{value: number|null, quality: 'high'|'medium'|'low', reason: string|null}} OCV proxy payload
 */
function estimateInstantaneousOpenCircuitVoltageProxy(
    terminalVoltage,
    current,
    resistanceBranch,
    sampleContext = {},
    options = {}
) {
    if (terminalVoltage === null || current === null) {
        return { value: null, quality: 'low', reason: 'missing_terminal_or_current' }
    }

    if (!resistanceBranch?.valid) {
        return { value: null, quality: 'low', reason: 'missing_valid_resistance_fit' }
    }

    const resolvedRMilliOhm = Number.isFinite(sampleContext.rMilliOhm)
        ? sampleContext.rMilliOhm
        : resistanceBranch.rMilliOhm

    if (!Number.isFinite(resolvedRMilliOhm) || resolvedRMilliOhm <= 0) {
        return { value: null, quality: 'low', reason: 'missing_valid_resistance_fit' }
    }

    const polarizationV = Number.isFinite(sampleContext.polarizationV) ? sampleContext.polarizationV : 0
    const rOhm = resolvedRMilliOhm / 1000
    const estimatedVoc = terminalVoltage + polarizationV + (current * rOhm)

    if (!Number.isFinite(estimatedVoc)) {
        return { value: null, quality: 'low', reason: 'non_finite_voc_proxy' }
    }

    const deadbandA = Number.isFinite(options.irCurrentDeadbandA)
        ? options.irCurrentDeadbandA
        : DEFAULT_IR_ESTIMATION_TUNING.irCurrentDeadbandA

    const underLoad = Math.abs(current) > deadbandA
    let quality = resistanceBranch.confidence === 'high'
        ? 'high'
        : resistanceBranch.confidence === 'medium'
            ? 'medium'
            : 'low'

    if (underLoad && quality === 'high') quality = 'medium'

    return {
        value: roundMetric(estimatedVoc, 'voltage'),
        quality,
        reason: polarizationV !== 0 ? 'instantaneous_rc_ohmic_proxy' : 'instantaneous_ohmic_proxy'
    }
}

/**
 * @brief Estimate open-circuit voltage with RC polarization proxy and low-current preference.
 * @param {number|null} terminalVoltage - Measured terminal voltage
 * @param {number|null} current - Branch current in amps
 * @param {Object|null} resistanceBranch - Resistance branch with optional rcState metadata
 * @param {Object} [options] - Proxy options
 * @param {number} [options.irCurrentDeadbandA] - Near-zero current deadband
 * @param {Object} [options.sampleContext] - When set, uses {@link estimateInstantaneousOpenCircuitVoltageProxy}
 * @returns {{value: number|null, quality: 'high'|'medium'|'low', reason: string|null}} OCV proxy payload
 */
function estimateOpenCircuitVoltageProxy(terminalVoltage, current, resistanceBranch, options = {}) {
    if (options.sampleContext) {
        return estimateInstantaneousOpenCircuitVoltageProxy(
            terminalVoltage,
            current,
            resistanceBranch,
            options.sampleContext,
            options
        )
    }

    if (terminalVoltage === null || current === null) {
        return { value: null, quality: 'low', reason: 'missing_terminal_or_current' }
    }

    const deadbandA = Number.isFinite(options.irCurrentDeadbandA)
        ? options.irCurrentDeadbandA
        : DEFAULT_IR_ESTIMATION_TUNING.irCurrentDeadbandA

    // Low-current samples are treated as direct pseudo-OCV observations.
    if (Math.abs(current) <= deadbandA) {
        return { value: terminalVoltage, quality: 'high', reason: 'low_current_proxy' }
    }

    if (!resistanceBranch?.valid || !Number.isFinite(resistanceBranch.rMilliOhm)) {
        return { value: null, quality: 'low', reason: 'missing_valid_resistance_fit' }
    }

    const rOhm = resistanceBranch.rMilliOhm / 1000
    const polarizationV = Number.isFinite(resistanceBranch?.rcState?.polarizationVoltage)
        ? resistanceBranch.rcState.polarizationVoltage
        : 0
    const estimatedVoc = terminalVoltage + polarizationV + (current * rOhm)

    if (!Number.isFinite(estimatedVoc)) {
        return { value: null, quality: 'low', reason: 'non_finite_voc_proxy' }
    }

    const quality = resistanceBranch.confidence === 'high'
        ? 'high'
        : resistanceBranch.confidence === 'medium'
            ? 'medium'
            : 'low'

    return {
        value: estimatedVoc,
        quality,
        reason: polarizationV !== 0 ? 'rc_corrected_ohmic_proxy' : 'ohmic_proxy'
    }
}

/**
 * @brief Integrate signed net amp-hours from window start up to a timestamp.
 * @param {Array<Object>} samples - Telemetry samples sorted by timestamp
 * @param {number} targetTimestamp - Upper bound timestamp in ms
 * @param {number} maxDtMs - Max interval duration for integration
 * @returns {number} Net Ah (discharge positive, regen negative)
 */
function integrateNetAhUpToTimestamp(samples, targetTimestamp, maxDtMs) {
    const data = Array.isArray(samples) ? samples : []
    if (data.length < 2 || !Number.isFinite(targetTimestamp)) return 0

    let netAh = 0

    for (let i = 0; i < data.length - 1; i += 1) {
        const sample = data[i] || {}
        const nextSample = data[i + 1] || {}
        const ts = toFiniteNumber(sample.timestamp)
        const nextTs = toFiniteNumber(nextSample.timestamp)
        if (ts === null || nextTs === null) continue

        const current = toFiniteNumber(sample.current)
        if (!Number.isFinite(current)) {
            if (nextTs > targetTimestamp) break
            continue
        }

        if (nextTs <= targetTimestamp) {
            const dtMs = nextTs - ts
            if (!isValidDuration(dtMs, maxDtMs)) continue
            netAh += current * (dtMs / 3600000)
            continue
        }

        if (ts < targetTimestamp) {
            const dtMs = targetTimestamp - ts
            if (isValidDuration(dtMs, maxDtMs)) {
                netAh += current * (dtMs / 3600000)
            }
        }
        break
    }

    return netAh
}

/**
 * @brief Estimate SoC percent at a timestamp from net Ah removed in the active window.
 * @param {Array<Object>} samples - Telemetry samples sorted by timestamp
 * @param {number} targetTimestamp - Upper bound timestamp in ms
 * @param {number} maxDtMs - Max interval duration for integration
 * @param {number} capacityAh - Reference capacity in Ah
 * @returns {number|null} Estimated SoC percent in [0,100] or null
 */
function estimateSocPctUpToTimestamp(samples, targetTimestamp, maxDtMs, capacityAh) {
    if (!Number.isFinite(capacityAh) || capacityAh <= 0) return null
    const netAh = integrateNetAhUpToTimestamp(samples, targetTimestamp, maxDtMs)
    const socPct = 100 - ((netAh / capacityAh) * 100)
    return Math.max(0, Math.min(100, socPct))
}

/**
 * @brief Integrate positive discharge amp-hours from window start up to a timestamp.
 * @param {Array<Object>} samples - Telemetry samples sorted by timestamp
 * @param {number} targetTimestamp - Upper bound timestamp in ms
 * @param {number} maxDtMs - Max interval duration for integration
 * @returns {number} Cumulative discharge Ah from first sample through targetTimestamp
 */
function integrateDischargeAhUpToTimestamp(samples, targetTimestamp, maxDtMs) {
    const data = Array.isArray(samples) ? samples : []
    if (data.length < 2 || !Number.isFinite(targetTimestamp)) return 0

    let dischargeAh = 0

    for (let i = 0; i < data.length - 1; i += 1) {
        const sample = data[i] || {}
        const nextSample = data[i + 1] || {}
        const ts = toFiniteNumber(sample.timestamp)
        const nextTs = toFiniteNumber(nextSample.timestamp)
        if (ts === null || nextTs === null) continue

        const current = toFiniteNumber(sample.current)
        if (!Number.isFinite(current) || current <= 0) {
            if (nextTs > targetTimestamp) break
            continue
        }

        if (nextTs <= targetTimestamp) {
            const dtMs = nextTs - ts
            if (!isValidDuration(dtMs, maxDtMs)) continue
            dischargeAh += current * (dtMs / 3600000)
            continue
        }

        if (ts < targetTimestamp) {
            const dtMs = targetTimestamp - ts
            if (isValidDuration(dtMs, maxDtMs)) {
                dischargeAh += current * (dtMs / 3600000)
            }
        }
        break
    }

    return dischargeAh
}

/**
 * @brief Build internal-resistance vs x-axis scatter points (Net Ah, SoC, or legacy discharge Ah).
 * @param {Array<Object>} samples - Active window telemetry samples sorted by timestamp
 * @param {Array<{timestamp: number, rMilliOhm: number, fitR2?: number}>} rollingWindows - Rolling resistance fit points
 * @param {Object} [options] - Series build options
 * @param {'netAh'|'soc'|'dischargeAh'} [options.xAxisMode='netAh'] - X-axis mode
 * @param {number} [options.maxDtMs=10000] - Max interval duration for Ah integration
 * @param {number} [options.nominalCapacityAh=36] - Capacity reference for SoC mode
 * @param {number} [options.minFitR2] - Optional minimum fit R² to include a point
 * @param {number} [options.rollingWindowSize=12] - Rolling window size for overlap penalty
 * @param {number} [options.rollingStep=4] - Rolling step for overlap penalty
 * @param {number} [options.modePurity] - Charge/discharge purity from branch fit
 * @param {number} [options.excitationScore] - Current excitation quality score
 * @returns {{points: Array<Object>, confidence: 'high'|'medium'|'low', xAxisMode: string, assumptions: string[], effectiveSampleCount: number}} IR vs X payload
 */
export function buildResistanceVsXSeries(samples, rollingWindows, options = {}) {
    const tuning = resolveIrEstimationOptions(options)
    const xAxisMode = options.xAxisMode === 'soc' || options.xAxisMode === 'dischargeAh'
        ? options.xAxisMode
        : 'netAh'
    const maxDtMs = Number.isFinite(options.maxDtMs) ? options.maxDtMs : 10000
    const minFitR2 = Number.isFinite(options.minFitR2) ? options.minFitR2 : null
    const nominalCapacityAh = Number.isFinite(options.nominalCapacityAh) ? options.nominalCapacityAh : 36
    const rolling = Array.isArray(rollingWindows) ? rollingWindows : []
    const data = Array.isArray(samples) ? samples : []

    const points = []
    for (const entry of rolling) {
        const timestamp = toFiniteNumber(entry?.timestamp)
        const rMilliOhm = toFiniteNumber(entry?.rMilliOhm)
        if (timestamp === null || rMilliOhm === null || rMilliOhm <= 0) continue

        const fitR2 = toFiniteNumber(entry?.fitR2)
        if (minFitR2 !== null && (fitR2 === null || fitR2 < minFitR2)) continue

        let x = null
        if (xAxisMode === 'soc') {
            x = estimateSocPctUpToTimestamp(data, timestamp, maxDtMs, nominalCapacityAh)
        } else if (xAxisMode === 'dischargeAh') {
            x = integrateDischargeAhUpToTimestamp(data, timestamp, maxDtMs)
        } else {
            x = integrateNetAhUpToTimestamp(data, timestamp, maxDtMs)
        }

        if (!Number.isFinite(x)) continue

        points.push({
            x,
            ah: xAxisMode === 'netAh' || xAxisMode === 'dischargeAh' ? x : null,
            socPct: xAxisMode === 'soc' ? x : null,
            rMilliOhm: roundResistanceMilliOhm(rMilliOhm),
            fitR2: fitR2 !== null ? roundMetric(fitR2, 'fitR2') : null,
            timestamp
        })
    }

    if (xAxisMode === 'soc') {
        points.sort((a, b) => a.x - b.x)
    } else {
        points.sort((a, b) => a.x - b.x)
    }

    const fitR2Values = points.map((point) => point.fitR2).filter((value) => Number.isFinite(value))
    const avgFitR2 = average(fitR2Values)
    const resistanceValues = points.map((point) => point.rMilliOhm).filter((value) => Number.isFinite(value))
    const lag1Autocorr = estimateLag1Autocorrelation(resistanceValues)
    const effectiveSampleCount = computeOverlapEffectiveSampleCount(
        points.length,
        tuning.rollingWindowSize,
        tuning.rollingStep
    )
    const confidence = resolveIrSeriesConfidenceV2({
        pointCount: points.length,
        rollingCount: rolling.length,
        avgFitR2,
        rollingWindowSize: tuning.rollingWindowSize,
        rollingStep: tuning.rollingStep,
        modePurity: options.modePurity,
        excitationScore: options.excitationScore ?? (lag1Autocorr !== null ? 1 - Math.abs(lag1Autocorr) : 0.5)
    })

    const assumptions = xAxisMode === 'soc'
        ? [
            'SoC is estimated from net Ah removed in the active window using configured nominal capacity.',
            'Regen/charge intervals increase estimated SoC by reducing net Ah.',
            'Confidence is overlap-adjusted for rolling-window autocorrelation.'
        ]
        : xAxisMode === 'dischargeAh'
            ? [
                'Ah is integrated from positive discharge current only (legacy mode).',
                'Sparse rolling windows or low fit R² reduce confidence.',
                'Confidence is overlap-adjusted for rolling-window autocorrelation.'
            ]
            : [
                'Net Ah integrates signed current (discharge positive, regen negative).',
                'Uses current integration, not the ampH telemetry channel.',
                'Confidence is overlap-adjusted for rolling-window autocorrelation.'
            ]

    return {
        points,
        confidence,
        xAxisMode,
        assumptions,
        effectiveSampleCount
    }
}

/**
 * @brief Build internal-resistance vs cumulative discharge Ah scatter points.
 * @description Backward-compatible wrapper defaulting to Net Ah axis in IR v2.
 * @param {Array<Object>} samples - Active window telemetry samples sorted by timestamp
 * @param {Array<{timestamp: number, rMilliOhm: number, fitR2?: number}>} rollingWindows - Rolling resistance fit points
 * @param {Object} [options] - Series build options
 * @returns {{points: Array<Object>, confidence: 'high'|'medium'|'low', assumptions: string[]}} IR vs Ah payload
 */
export function buildResistanceVsAhSeries(samples, rollingWindows, options = {}) {
    const xAxisMode = options.xAxisMode
        || (options.legacyDischargeAh ? 'dischargeAh' : 'netAh')
    return buildResistanceVsXSeries(samples, rollingWindows, {
        ...options,
        xAxisMode
    })
}

/**
 * @brief Build V–I scatter samples for a selected branch voltage key.
 * @param {Array<Object>} samples - Telemetry samples sorted by timestamp
 * @param {string} voltageKey - Sample voltage key (`voltage`, `voltageLower`, `voltageHigh`)
 * @returns {Array<Object>} Scatter points with current and branch voltage
 */
function buildViScatterSeries(samples, voltageKey) {
    const data = Array.isArray(samples) ? samples : []
    const scatter = []

    for (let i = 0; i < data.length; i += 1) {
        const sample = data[i] || {}
        const timestamp = toFiniteNumber(sample.timestamp)
        const current = toFiniteNumber(sample.current)
        const voltage = toFiniteNumber(sample?.[voltageKey])
        if (timestamp === null || !Number.isFinite(current) || voltage === null) continue

        scatter.push({
            timestamp,
            current,
            voltage,
            lowerVoltage: toFiniteNumber(sample.voltageLower),
            upperVoltage: toFiniteNumber(sample.voltageHigh)
        })
    }

    return scatter
}

/**
 * @brief Build chart-friendly battery time-series and scatter datasets.
 * @param {Array<Object>} samples - Telemetry samples sorted by timestamp
 * @param {number} maxDtMs - Max interval duration for derived series integration
 * @param {string} [voltageKey='voltage'] - Primary voltage channel for branch timelines/scatter
 * @param {boolean} [includeAllVoltages=false] - Include combined/lower/upper on timeline (combined section)
 * @returns {Object} Chart data collections for one branch view
 */
function buildBatteryChartSeries(samples, maxDtMs, voltageKey = 'voltage', includeAllVoltages = false) {
    const data = Array.isArray(samples) ? samples : []
    const timeline = []

    for (let i = 0; i < data.length; i += 1) {
        const sample = data[i] || {}
        const timestamp = toFiniteNumber(sample.timestamp)
        if (timestamp === null) continue
        const combinedVoltage = toFiniteNumber(sample.voltage)
        const lowerVoltage = toFiniteNumber(sample.voltageLower)
        const upperVoltage = toFiniteNumber(sample.voltageHigh)
        const branchVoltage = toFiniteNumber(sample?.[voltageKey])
        const current = toFiniteNumber(sample.current)

        timeline.push({
            timestamp,
            combinedVoltage: includeAllVoltages ? combinedVoltage : (voltageKey === 'voltage' ? branchVoltage : null),
            lowerVoltage: includeAllVoltages ? lowerVoltage : (voltageKey === 'voltageLower' ? branchVoltage : null),
            upperVoltage: includeAllVoltages ? upperVoltage : (voltageKey === 'voltageHigh' ? branchVoltage : null),
            current
        })
    }

    const cadenceFilteredTimeline = timeline.filter((point, index) => {
        if (index >= timeline.length - 1) return true
        const dtMs = timeline[index + 1].timestamp - point.timestamp
        return isValidDuration(dtMs, maxDtMs)
    })

    return {
        timeline: cadenceFilteredTimeline,
        viScatter: buildViScatterSeries(data, voltageKey)
    }
}

/**
 * @brief Build per-sample terminal voltage, estimated V_oc, and current for trend charts.
 * @param {Array<Object>} samples - Telemetry samples sorted by timestamp
 * @param {number} maxDtMs - Max interval duration for cadence filtering
 * @param {string} voltageKey - Terminal voltage channel (`voltage`, `voltageHigh`, `voltageLower`)
 * @param {Object|null} resistanceBranch - Resistance branch used for the ohmic V_oc proxy
 * @param {Object} [vocOptions] - Proxy options
 * @param {number} [vocOptions.irCurrentDeadbandA] - Near-zero current deadband for quality labeling
 * @returns {Array<{timestamp: number, terminalVoltage: number|null, estimatedVoc: number|null, smoothedVoc: number|null, vC20: number|null, current: number|null}>}
 */
function buildVocTrendSeries(samples, maxDtMs, voltageKey, resistanceBranch, vocOptions = {}) {
    const data = Array.isArray(samples) ? samples : []
    const tuning = resolveIrEstimationOptions(vocOptions)
    const polarizationByTimestamp = buildPolarizationByTimestamp(data, voltageKey, tuning)
    const rolling = resistanceBranch?.rolling || []
    const fallbackRMilliOhm = resistanceBranch?.rMilliOhm ?? null
    const nominalCapacityAh = Number.isFinite(vocOptions.nominalCapacityAh) && vocOptions.nominalCapacityAh > 0
        ? vocOptions.nominalCapacityAh
        : 36

    const trend = []
    let smoothedVoc = null
    let prevTimestamp = null

    for (let i = 0; i < data.length; i += 1) {
        const sample = data[i] || {}
        const timestamp = toFiniteNumber(sample.timestamp)
        if (timestamp === null) continue

        const terminalVoltage = toFiniteNumber(sample?.[voltageKey])
        const current = toFiniteNumber(sample.current)
        const polarizationV = polarizationByTimestamp.get(timestamp) ?? 0
        const rMilliOhm = resolveRollingResistanceMilliOhm(rolling, timestamp, fallbackRMilliOhm)
        const vocProxy = estimateInstantaneousOpenCircuitVoltageProxy(
            terminalVoltage,
            current,
            resistanceBranch,
            { polarizationV, rMilliOhm },
            { irCurrentDeadbandA: vocOptions.irCurrentDeadbandA }
        )
        const vC20 = estimateC20TerminalVoltage(terminalVoltage, current, {
            rMilliOhm,
            polarizationV,
            nominalCapacityAh,
            resistanceValid: resistanceBranch?.valid === true
        })

        let smoothedVocPoint = null
        if (Number.isFinite(vocProxy.value)) {
            if (smoothedVoc === null) {
                smoothedVoc = vocProxy.value
            } else if (prevTimestamp !== null) {
                const dtSec = Math.max(0, (timestamp - prevTimestamp) / 1000)
                const alpha = dtSec > 0
                    ? 1 - Math.exp(-dtSec / VOC_TREND_EMA_TAU_SEC)
                    : 0
                smoothedVoc += alpha * (vocProxy.value - smoothedVoc)
            }
            smoothedVocPoint = roundMetric(smoothedVoc, 'voltage')
        }

        prevTimestamp = timestamp
        trend.push({
            timestamp,
            terminalVoltage,
            current,
            estimatedVoc: vocProxy.value,
            smoothedVoc: smoothedVocPoint,
            vC20
        })
    }

    return trend.filter((point, index) => {
        if (index >= trend.length - 1) return true
        const dtMs = trend[index + 1].timestamp - point.timestamp
        return isValidDuration(dtMs, maxDtMs)
    })
}

/**
 * @brief Attach smoothed V_oc samples to a voltage timeline by timestamp.
 * @param {Array<Object>} timeline - Timeline points from {@link buildBatteryChartSeries}
 * @param {Array<Object>} vocTrend - V_oc trend from {@link buildVocTrendSeries}
 * @returns {Array<Object>} Timeline points with optional smoothedVoc field
 */
function mergeSmoothedVocIntoTimeline(timeline, vocTrend) {
    const smoothedByTimestamp = new Map()
    for (const point of Array.isArray(vocTrend) ? vocTrend : []) {
        const ts = toFiniteNumber(point?.timestamp)
        const smoothedVoc = toFiniteNumber(point?.smoothedVoc)
        if (ts !== null && smoothedVoc !== null) smoothedByTimestamp.set(ts, smoothedVoc)
    }

    return (Array.isArray(timeline) ? timeline : []).map((point) => ({
        ...point,
        smoothedVoc: smoothedByTimestamp.get(point.timestamp) ?? null
    }))
}

function buildIrChartSeriesForBranch(samples, branchEstimate, irOptions) {
    const rolling = branchEstimate?.rolling || []
    const shared = {
        maxDtMs: irOptions.maxDtMs,
        nominalCapacityAh: irOptions.nominalCapacityAh,
        rollingWindowSize: irOptions.rollingWindowSize,
        rollingStep: irOptions.rollingStep,
        modePurity: branchEstimate?.modePurity,
        excitationScore: branchEstimate?.excitationScore
    }
    const netAh = buildResistanceVsXSeries(samples, rolling, { ...shared, xAxisMode: 'netAh' })
    return {
        netAh,
        resistanceVsAh: netAh
    }
}

/**
 * @brief Build per-branch chart bundles (timeline, scatter, IR vs x-axis).
 * @param {Array<Object>} samples - Telemetry samples sorted by timestamp
 * @param {Object} resistance - Output from {@link computeSupplyResistance}
 * @param {number} maxDtMs - Max interval duration for integration
 * @param {Object} [irOptions] - IR chart/integration options
 * @returns {Object} Nested chart series for combined/upper/lower sections
 */
function buildPerBranchChartSeries(samples, resistance, maxDtMs, irOptions = {}) {
    const branches = resistance?.branches || {}
    const combinedBase = buildBatteryChartSeries(samples, maxDtMs, 'voltage', true)
    const upperBase = buildBatteryChartSeries(samples, maxDtMs, 'voltageHigh', false)
    const lowerBase = buildBatteryChartSeries(samples, maxDtMs, 'voltageLower', false)
    const resolvedIrOptions = {
        maxDtMs,
        nominalCapacityAh: Number.isFinite(irOptions.nominalCapacityAh) ? irOptions.nominalCapacityAh : 36,
        rollingWindowSize: Number.isFinite(irOptions.rollingWindowSize) ? irOptions.rollingWindowSize : 12,
        rollingStep: Number.isFinite(irOptions.rollingStep) ? irOptions.rollingStep : 4,
        irCurrentDeadbandA: Number.isFinite(irOptions.irCurrentDeadbandA)
            ? irOptions.irCurrentDeadbandA
            : DEFAULT_IR_ESTIMATION_TUNING.irCurrentDeadbandA
    }

    const combinedVocTrend = buildVocTrendSeries(samples, maxDtMs, 'voltage', branches.total, resolvedIrOptions)
    const upperVocTrend = buildVocTrendSeries(samples, maxDtMs, 'voltageHigh', branches.upper, resolvedIrOptions)
    const lowerVocTrend = buildVocTrendSeries(samples, maxDtMs, 'voltageLower', branches.lower, resolvedIrOptions)

    return {
        combined: {
            timeline: mergeSmoothedVocIntoTimeline(combinedBase.timeline, combinedVocTrend),
            viScatter: combinedBase.viScatter,
            vocTrend: combinedVocTrend,
            ...buildIrChartSeriesForBranch(samples, branches.total, resolvedIrOptions)
        },
        upper: {
            timeline: mergeSmoothedVocIntoTimeline(upperBase.timeline, upperVocTrend),
            viScatter: upperBase.viScatter,
            vocTrend: upperVocTrend,
            ...buildIrChartSeriesForBranch(samples, branches.upper, resolvedIrOptions)
        },
        lower: {
            timeline: mergeSmoothedVocIntoTimeline(lowerBase.timeline, lowerVocTrend),
            viScatter: lowerBase.viScatter,
            vocTrend: lowerVocTrend,
            ...buildIrChartSeriesForBranch(samples, branches.lower, resolvedIrOptions)
        }
    }
}

/**
 * @brief Compute pack or single-battery health estimates and metadata for UI cards/modals.
 * @param {Array<Object>} samples - Telemetry samples sorted by timestamp
 * @param {Object} options - Calculation options
 * @param {number} options.maxDtMs - Max interval duration for integration
 * @param {number} options.nominalCapacityAh - Nominal capacity in Ah for this scope
 * @param {number} options.nominalSeriesVoltage - Nominal voltage in V for this scope
 * @param {number} options.peukertExponent - Peukert exponent
 * @param {'pack'|'battery'} [options.scope='pack'] - Metric scope
 * @param {string} [options.voltageKey='voltage'] - Voltage channel for V_oc zone lookup
 * @param {Object|null} [options.resistanceEstimate] - Resistance estimate for this scope
 * @param {string} [options.scopeLabel='battery pack'] - Human-readable scope label
 * @returns {Object} Battery health and confidence payload
 */
function computeBatteryHealthMetrics(samples, options) {
    const data = Array.isArray(samples) ? samples : []
    const {
        maxDtMs,
        nominalCapacityAh,
        nominalSeriesVoltage,
        peukertExponent,
        supplyResistance: precomputedResistance,
        scope = 'pack',
        voltageKey = 'voltage',
        resistanceEstimate = null,
        actualCapacityAh = null,
        scopeLabel = 'battery pack',
        irCurrentDeadbandA = DEFAULT_IR_ESTIMATION_TUNING.irCurrentDeadbandA,
        dischargeCycleMetrics = null
    } = options
    const cycleMetrics = dischargeCycleMetrics || computeDischargeCyclePeukertMetrics(data, {
        maxDtMs,
        nominalCapacityAh,
        peukertExponent,
        idealCapacityAh: Number.isFinite(actualCapacityAh) && actualCapacityAh > 0 ? actualCapacityAh : nominalCapacityAh,
        irCurrentDeadbandA
    })

    const emptyCapacityBlock = buildCapacityHealthBlock({
        dischargeAh: 0,
        avgDischargeCurrentA: null,
        nominalCapacityAh,
        peukertExponent,
        validIntervals: 0,
        dodCoverage: 0,
        scopeLabel,
        dischargeSource: 'current',
        actualCapacityAh
    })
    const emptySohConfidence = resolveMetricConfidence({
        sampleCount: 0,
        coverageRatio: 0,
        assumptionScore: 0.2
    })
    const idealCapacityAh = Number.isFinite(actualCapacityAh) && actualCapacityAh > 0 ? actualCapacityAh : nominalCapacityAh
    const windowPeukertMetrics = integratePeukertNormalizedNetAh(data, {
        maxDtMs,
        nominalCapacityAh,
        peukertExponent
    })

    if (data.length < 2) {
        const emptySohMetrics = computeDeltaAhSocWindowSoh(data, {
            maxDtMs,
            voltageKey,
            resistanceBranch: resistanceEstimate,
            nominalCapacityAh,
            nominalSeriesVoltage,
            idealCapacityAh,
            peukertExponent,
            irCurrentDeadbandA
        })
        return mergeDischargeCycleIntoHealth({
            dischargeAh: 0,
            dischargeDurationHours: 0,
            avgDischargeCurrentA: null,
            dischargeSource: 'current',
            dodPct: buildBatteryMetricDescriptor({
                id: 'dodPct',
                metricType: 'estimated',
                value: null,
                confidence: 'low',
                reason: 'insufficient_samples',
                assumptions: ['Nominal capacity unavailable for this window.']
            }),
            peukert: emptyCapacityBlock.peukert,
            voltageZone: {
                ...classifyVoltageZone(null, nominalSeriesVoltage),
                descriptor: buildBatteryMetricDescriptor({
                    id: 'voltage_zone',
                    metricType: 'estimated',
                    value: null,
                    confidence: 'low',
                    reason: 'missing_estimated_voc',
                    assumptions: ['Requires latest voltage/current and a valid resistance fit for this scope.']
                })
            }
        }, cycleMetrics, {
            scopeLabel,
            confidence: emptySohConfidence,
            sohMetrics: emptySohMetrics,
            windowPeukertMetrics,
            idealCapacityAh,
            nominalCapacityAh
        })
    }

    const supplyResistance = precomputedResistance || computeSupplyResistance(data, resolveIrEstimationOptions(options))
    const resistanceForZone = resistanceEstimate
        || (scope === 'pack'
            ? (supplyResistance.branches?.total || supplyResistance)
            : null)

    const windowDischarge = resolveWindowDischargeAh(data, maxDtMs)
    const { dischargeAh, dischargeDurationHours, validIntervals, source: dischargeSource } = windowDischarge
    const dodCoverage = data.length > 1 ? validIntervals / (data.length - 1) : 0
    let avgDischargeCurrentA = dischargeDurationHours > 0 ? dischargeAh / dischargeDurationHours : null
    // When ampH supplies discharge but current integration has no positive intervals, estimate I_avg from window span.
    if (!Number.isFinite(avgDischargeCurrentA) && dischargeAh > 0 && data.length >= 2) {
        const firstTs = toFiniteNumber(data[0]?.timestamp)
        const lastTs = toFiniteNumber(data[data.length - 1]?.timestamp)
        const windowHours = firstTs !== null && lastTs !== null && lastTs > firstTs
            ? (lastTs - firstTs) / 3600000
            : 0
        if (windowHours > 0) {
            avgDischargeCurrentA = dischargeAh / windowHours
        }
    }

    const capacityHealth = buildCapacityHealthBlock({
        dischargeAh,
        avgDischargeCurrentA,
        nominalCapacityAh,
        peukertExponent,
        validIntervals,
        dodCoverage,
        scopeLabel,
        dischargeSource,
        actualCapacityAh
    })

    const latestSample = getLatestBatterySample(data, voltageKey)
    const latestVocContext = latestSample && Number.isFinite(latestSample.timestamp)
        ? buildVocSampleContext(data, voltageKey, resistanceForZone, latestSample.timestamp, { irCurrentDeadbandA })
        : { polarizationV: 0, rMilliOhm: resistanceForZone?.rMilliOhm ?? null }
    const vocProxy = latestSample && latestSample.current !== null
        ? estimateOpenCircuitVoltageProxy(
            latestSample.voltage,
            latestSample.current,
            resistanceForZone,
            { irCurrentDeadbandA, sampleContext: latestVocContext }
        )
        : { value: null, quality: 'low', reason: 'missing_sample' }
    const estimatedVoc = vocProxy.value
    const voltageZone = classifyVoltageZone(
        estimatedVoc,
        nominalSeriesVoltage,
        latestSample?.voltage ?? null
    )
    const resistanceConfidenceScore = resistanceForZone?.valid
        ? (resistanceForZone.confidence === 'high' ? 0.9 : resistanceForZone.confidence === 'medium' ? 0.7 : 0.45)
        : 0.2
    const ocvQualityScore = vocProxy.quality === 'high' ? 0.95 : vocProxy.quality === 'medium' ? 0.7 : 0.35
    const voltageZoneConfidence = Number.isFinite(estimatedVoc)
        ? resolveMetricConfidence({
            sampleCount: resistanceForZone?.sampleCount || 0,
            coverageRatio: dodCoverage,
            assumptionScore: resistanceConfidenceScore * ocvQualityScore
        })
        : 'low'

    const sohConfidence = resolveMetricConfidence({
        sampleCount: validIntervals,
        coverageRatio: dodCoverage,
        assumptionScore: 0.25
    })
    const windowSohMetrics = computeDeltaAhSocWindowSoh(data, {
        maxDtMs,
        voltageKey,
        resistanceBranch: resistanceForZone,
        nominalCapacityAh,
        nominalSeriesVoltage,
        idealCapacityAh,
        peukertExponent,
        irCurrentDeadbandA
    })
    const deltaSohConfidence = resolveMetricConfidence({
        sampleCount: windowSohMetrics.validIntervals || validIntervals,
        coverageRatio: windowSohMetrics.coverageRatio || dodCoverage,
        assumptionScore: Number.isFinite(windowSohMetrics.sohPctValue)
            ? (windowSohMetrics.deltaSoc >= 0.5 ? 0.85 : 0.65)
            : 0.25
    })

    return mergeDischargeCycleIntoHealth({
        dischargeAh,
        dischargeDurationHours,
        avgDischargeCurrentA,
        dischargeSource,
        rawDodPct: capacityHealth.rawDodPct,
        dodExceedsNominal: capacityHealth.dodExceedsNominal,
        dodBasis: capacityHealth.dodBasis,
        actualCapacityAh: capacityHealth.actualCapacityAh,
        actualCapacitySource: capacityHealth.actualCapacitySource,
        dodPct: capacityHealth.dodPct,
        peukert: capacityHealth.peukert,
        voltageZone: {
            ...voltageZone,
            descriptor: buildBatteryMetricDescriptor({
                id: 'voltage_zone',
                metricType: 'estimated',
                value: estimatedVoc,
                confidence: voltageZoneConfidence,
                reason: voltageZone.zone
                    ? null
                    : (Number.isFinite(estimatedVoc) ? 'missing_voltage' : (vocProxy.reason || 'missing_estimated_voc')),
                assumptions: scope === 'pack'
                    ? [
                        'Zone cutoffs are open-circuit thresholds, not loaded terminal voltage.',
                        'Estimated V_oc uses per-sample RC polarization and rolling resistance: V_oc ≈ V_terminal + Vp(t) + I(t)×R(t).',
                        'Loaded-zone label is reported separately from OCV zone.'
                    ]
                    : [
                        'Zone cutoffs are per-battery open-circuit thresholds (12V reference).',
                        'Estimated V_oc uses per-sample RC polarization and rolling resistance for this branch.',
                        'Loaded terminal voltage is shown as a separate loaded-zone context state.'
                    ]
            })
        }
    }, cycleMetrics, {
        scopeLabel,
        confidence: deltaSohConfidence || sohConfidence,
        sohMetrics: windowSohMetrics,
        windowPeukertMetrics,
        idealCapacityAh,
        nominalCapacityAh
    })
}

/**
 * @brief Compute lower/upper battery channel metrics for analytics panels.
 * @param {Array<Object>} samples - Telemetry samples sorted by timestamp
 * @param {Object} [options] - Metric computation options
 * @param {number} [options.maxDtMs=10000] - Max interval duration for integration
 * @returns {Object} Lower and upper battery metric groups
 */
export function computeBatteryWindowMetrics(samples, options = {}) {
    const maxDtMs = Number.isFinite(options.maxDtMs) ? options.maxDtMs : 10000
    const nominalCapacityAh = Number.isFinite(options.nominalCapacityAh) ? options.nominalCapacityAh : 36
    const nominalSeriesVoltage = Number.isFinite(options.nominalSeriesVoltage) ? options.nominalSeriesVoltage : 24
    const peukertExponent = Number.isFinite(options.peukertExponent) ? options.peukertExponent : 1.16
    const irOptions = resolveIrEstimationOptions({
        minSampleCount: options.minSampleCount,
        minCurrentSpread: options.minCurrentSpread,
        rollingWindowSize: options.rollingWindowSize,
        rollingStep: options.rollingStep,
        irCurrentDeadbandA: options.irCurrentDeadbandA,
        irRcTauSec: options.irRcTauSec,
        irRcResistanceScale: options.irRcResistanceScale
    })

    const supplyResistance = options.supplyResistance || computeSupplyResistance(samples, irOptions)

    const combined = computeBatteryChannelMetrics(samples, 'voltage', maxDtMs)
    const lower = computeBatteryChannelMetrics(samples, 'voltageLower', maxDtMs)
    const upper = computeBatteryChannelMetrics(samples, 'voltageHigh', maxDtMs)
    // Series string: each battery shares pack current, so Ah rating matches pack (only voltage splits).
    const nominalBatteryCapacityAh = nominalCapacityAh
    const nominalBatteryVoltage = nominalSeriesVoltage / 2
    const actualCapacityAh = Number.isFinite(options.actualCapacityAh) ? options.actualCapacityAh : null
    const actualBatteryCapacityAh = actualCapacityAh
    const idealCapacityAh = actualBatteryCapacityAh > 0 ? actualBatteryCapacityAh : nominalCapacityAh
    const dischargeCycleMetrics = computeDischargeCyclePeukertMetrics(samples, {
        maxDtMs,
        nominalCapacityAh,
        peukertExponent,
        idealCapacityAh,
        irCurrentDeadbandA: irOptions.irCurrentDeadbandA
    })

    const sharedHealthOptions = {
        maxDtMs,
        peukertExponent,
        minSampleCount: irOptions.minSampleCount,
        minCurrentSpread: irOptions.minCurrentSpread,
        irCurrentDeadbandA: irOptions.irCurrentDeadbandA,
        irRcTauSec: irOptions.irRcTauSec,
        irRcResistanceScale: irOptions.irRcResistanceScale,
        supplyResistance,
        dischargeCycleMetrics
    }

    const health = computeBatteryHealthMetrics(samples, {
        ...sharedHealthOptions,
        scope: 'pack',
        scopeLabel: 'battery pack',
        nominalCapacityAh,
        nominalSeriesVoltage,
        actualCapacityAh,
        voltageKey: 'voltage',
        resistanceEstimate: supplyResistance.branches?.total || supplyResistance
    })

    const batteryHealth = {
        lower: computeBatteryHealthMetrics(samples, {
            ...sharedHealthOptions,
            scope: 'battery',
            scopeLabel: 'lower battery',
            nominalCapacityAh: nominalBatteryCapacityAh,
            nominalSeriesVoltage: nominalBatteryVoltage,
            actualCapacityAh: actualBatteryCapacityAh,
            voltageKey: 'voltageLower',
            resistanceEstimate: supplyResistance.branches?.lower
        }),
        upper: computeBatteryHealthMetrics(samples, {
            ...sharedHealthOptions,
            scope: 'battery',
            scopeLabel: 'upper battery',
            nominalCapacityAh: nominalBatteryCapacityAh,
            nominalSeriesVoltage: nominalBatteryVoltage,
            actualCapacityAh: actualBatteryCapacityAh,
            voltageKey: 'voltageHigh',
            resistanceEstimate: supplyResistance.branches?.upper
        })
    }

    return {
        combined,
        lower,
        upper,
        health,
        batteryHealth,
        supplyResistance,
        chartSeries: buildPerBranchChartSeries(samples, supplyResistance, maxDtMs, {
            nominalCapacityAh,
            rollingWindowSize: irOptions.rollingWindowSize,
            rollingStep: irOptions.rollingStep,
            irCurrentDeadbandA: irOptions.irCurrentDeadbandA
        }),
        assumptions: {
            nominalCapacityAh,
            nominalSeriesVoltage,
            peukertExponent
        }
    }
}

/**
 * @brief Compute median value from a numeric array.
 * @param {number[]} values - Numeric values
 * @returns {number|null} Median value or null
 */
function median(values) {
    if (!Array.isArray(values) || values.length === 0) return null
    const sorted = [...values].sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    if (sorted.length % 2 === 0) {
        return (sorted[middle - 1] + sorted[middle]) / 2
    }
    return sorted[middle]
}

/**
 * @brief Compute population standard deviation for numeric array.
 * @param {number[]} values - Numeric values
 * @returns {number|null} Population standard deviation or null
 */
function standardDeviation(values) {
    if (!Array.isArray(values) || values.length === 0) return null
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length
    const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length
    return Math.sqrt(variance)
}

/**
 * @brief Convert sample speed into miles-per-hour.
 * @param {number} speed - Speed value in selected unit
 * @param {'mph'|'kph'|'ms'} speedUnit - Input speed unit
 * @returns {number} Speed in mph
 */
function speedToMph(speed, speedUnit) {
    if (!Number.isFinite(speed)) return 0
    if (speedUnit === 'kph') return speed / 1.609344
    if (speedUnit === 'ms') return speed / 0.44704
    return speed
}

/**
 * @brief Compute average value from finite numbers.
 * @param {number[]} values - Candidate numeric values
 * @returns {number|null} Average value or null
 */
function average(values) {
    if (!Array.isArray(values) || values.length === 0) return null
    const finite = values.filter((value) => Number.isFinite(value))
    if (finite.length === 0) return null
    return finite.reduce((sum, value) => sum + value, 0) / finite.length
}

/**
 * @brief Build sorted lap summary array from race/lap maps.
 * @param {Array<Object>|Object|null|undefined} lapsSource - Lap array or race.laps map
 * @returns {Array<Object>} Sorted lap summaries
 */
function normalizeLaps(lapsSource) {
    if (Array.isArray(lapsSource)) {
        return [...lapsSource].sort((a, b) => (a?.lapNumber || 0) - (b?.lapNumber || 0))
    }
    if (lapsSource && typeof lapsSource === 'object') {
        return Object.values(lapsSource).sort((a, b) => (a?.lapNumber || 0) - (b?.lapNumber || 0))
    }
    return []
}

/**
 * @brief Evaluate lap confidence label and reasons from lap summary heuristics.
 * @param {Object} lap - Current lap summary
 * @param {Object|null} previousLap - Previous lap summary
 * @param {Object} [options] - Confidence options
 * @param {number} [options.minLapTimeSec=15] - Minimum plausible lap time
 * @param {number} [options.maxLapTimeSec=600] - Maximum plausible lap time
 * @param {number} [options.maxMissingMetrics=2] - Max missing LL_* metrics before suspect
 * @param {number} [options.maxLapJump=1] - Max allowed lap number jump
 * @returns {{label: 'good'|'suspect'|'invalid', score: number, reasons: string[]}} Confidence output
 */
export function scoreLapConfidence(lap, previousLap = null, options = {}) {
    const minLapTimeSec = Number.isFinite(options.minLapTimeSec) ? options.minLapTimeSec : 15
    const maxLapTimeSec = Number.isFinite(options.maxLapTimeSec) ? options.maxLapTimeSec : 600
    const maxMissingMetrics = Number.isFinite(options.maxMissingMetrics) ? Math.max(0, Math.round(options.maxMissingMetrics)) : 2
    const maxLapJump = Number.isFinite(options.maxLapJump) ? Math.max(1, Math.round(options.maxLapJump)) : 1

    const reasons = []
    let score = 100
    const lapNumber = toFiniteNumber(lap?.lapNumber)
    const lapTime = toFiniteNumber(lap?.LL_Time)

    if (lapTime === null || lapTime <= 0) {
        return {
            label: 'invalid',
            score: 0,
            reasons: ['missing_or_nonpositive_lap_time']
        }
    }

    if (lapTime < minLapTimeSec) {
        score -= 60
        reasons.push('lap_time_below_minimum_bound')
    }
    if (lapTime > maxLapTimeSec) {
        score -= 60
        reasons.push('lap_time_above_maximum_bound')
    }

    const placeholderMetricKeys = ['LL_V', 'LL_I', 'LL_RPM', 'LL_Spd', 'LL_Ah', 'LL_Eff']
    const missingMetricCount = placeholderMetricKeys.reduce((count, key) => {
        return toFiniteNumber(lap?.[key]) === null ? count + 1 : count
    }, 0)
    if (missingMetricCount > maxMissingMetrics) {
        score -= 30
        reasons.push('missing_ll_placeholder_metrics')
    }

    const previousLapNumber = toFiniteNumber(previousLap?.lapNumber)
    if (lapNumber !== null && previousLapNumber !== null) {
        const lapJump = Math.abs(lapNumber - previousLapNumber)
        if (lapJump > maxLapJump) {
            score -= 30
            reasons.push('lap_sequence_jump_detected')
        }
    }

    if (score <= 20) {
        return { label: 'invalid', score: Math.max(0, score), reasons }
    }
    if (score < 80 || reasons.length > 0) {
        return { label: 'suspect', score: Math.max(0, score), reasons }
    }
    return { label: 'good', score, reasons }
}

/**
 * @brief Annotate laps with confidence labels and scores.
 * @param {Array<Object>|Object} lapsSource - Lap array or race.laps map
 * @param {Object} [options] - Confidence options forwarded to {@link scoreLapConfidence}
 * @returns {Array<Object>} Laps with confidence metadata
 */
export function annotateLapConfidence(lapsSource, options = {}) {
    const laps = normalizeLaps(lapsSource)
    return laps.map((lap, index) => {
        const confidence = scoreLapConfidence(lap, index > 0 ? laps[index - 1] : null, options)
        return {
            ...lap,
            confidenceLabel: confidence.label,
            confidenceScore: confidence.score,
            confidenceReasons: confidence.reasons
        }
    })
}

/**
 * @brief Filter lap list using confidence and minimum-lap constraints.
 * @param {Array<Object>|Object} lapsSource - Lap array or race.laps map
 * @param {Object} [filters] - Lap filters
 * @param {boolean} [filters.hideSuspect=false] - Hide suspect laps
 * @param {boolean} [filters.hideInvalid=false] - Hide invalid laps
 * @param {boolean} [filters.excludeFirstLap=false] - Exclude first lap
 * @param {number} [filters.minimumLapTimeSec=0] - Minimum lap time threshold
 * @returns {{laps: Array<Object>, excluded: Array<Object>}} Included and excluded laps
 */
export function filterLapSummaries(lapsSource, filters = {}) {
    const hideSuspect = filters.hideSuspect === true
    const hideInvalid = filters.hideInvalid === true
    const excludeFirstLap = filters.excludeFirstLap === true
    const minimumLapTimeSec = Number.isFinite(filters.minimumLapTimeSec) ? filters.minimumLapTimeSec : 0
    const confidenceOptions = filters.confidenceOptions || {}

    const laps = annotateLapConfidence(lapsSource, confidenceOptions)
    const included = []
    const excluded = []

    laps.forEach((lap, index) => {
        const lapTime = toFiniteNumber(lap?.LL_Time)
        const isFirstLap = index === 0 || lap?.lapNumber === 1
        const excludedReasons = []

        if (excludeFirstLap && isFirstLap) excludedReasons.push('excluded_first_lap')
        if (lapTime !== null && minimumLapTimeSec > 0 && lapTime < minimumLapTimeSec) excludedReasons.push('below_minimum_lap_time')
        if (hideSuspect && lap.confidenceLabel === 'suspect') excludedReasons.push('suspect_lap_hidden')
        if (hideInvalid && lap.confidenceLabel === 'invalid') excludedReasons.push('invalid_lap_hidden')

        if (excludedReasons.length > 0) {
            excluded.push({ ...lap, excludedReasons })
        } else {
            included.push(lap)
        }
    })

    return {
        laps: included,
        excluded
    }
}

/**
 * @brief Compute per-lap degradation values for a given metric.
 * @param {Array<Object>|Object} lapsSource - Lap array or race.laps map
 * @param {string} metricKey - Metric key (e.g. LL_Time, LL_Ah, LL_Eff)
 * @param {Object} [options] - Degradation options
 * @param {number} [options.rollingWindow=3] - Rolling average window size
 * @returns {Object} Degradation summary and points
 */
export function computeLapDegradation(lapsSource, metricKey, options = {}) {
    const rollingWindow = Number.isFinite(options.rollingWindow)
        ? Math.max(2, Math.round(options.rollingWindow))
        : 3
    const laps = normalizeLaps(lapsSource)
    const points = laps
        .map((lap) => ({
            lapNumber: lap?.lapNumber,
            value: toFiniteNumber(lap?.[metricKey])
        }))
        .filter((point) => Number.isFinite(point.lapNumber) && point.value !== null)

    if (points.length === 0) {
        return {
            metricKey,
            bestValue: null,
            trendSlopePerLap: null,
            points: [],
            sparkline: []
        }
    }

    const values = points.map((point) => point.value)
    const bestValue = Math.min(...values)
    const sparkline = [...values]
    const augmentedPoints = points.map((point, index) => {
        const start = Math.max(0, index - rollingWindow)
        const historyValues = values.slice(start, index)
        const rollingAverage = historyValues.length > 0
            ? historyValues.reduce((sum, value) => sum + value, 0) / historyValues.length
            : null
        return {
            ...point,
            deltaToBest: point.value - bestValue,
            rollingAverage,
            deltaToRollingAverage: rollingAverage === null ? null : point.value - rollingAverage
        }
    })

    const xs = values.map((_, index) => index + 1)
    const trend = linearRegression(xs, values)

    return {
        metricKey,
        bestValue,
        trendSlopePerLap: trend ? trend.slope : null,
        points: augmentedPoints,
        sparkline
    }
}

/**
 * @brief Compute session/stint KPI summary from lap summaries and telemetry samples.
 * @param {Array<Object>|Object} lapsSource - Lap array or race.laps map
 * @param {Array<Object>} [samples=[]] - Optional telemetry samples from same session
 * @param {Object} [options] - KPI options
 * @param {number} [options.lastNLaps=5] - Number of laps to include in recent trend
 * @returns {Object} Session KPI summary
 */
export function computeSessionStintKpis(lapsSource, samples = [], options = {}) {
    const lastNLaps = Number.isFinite(options.lastNLaps) ? Math.max(2, Math.round(options.lastNLaps)) : 5
    const baseLaps = normalizeLaps(lapsSource)
    const laps = typeof options.lapFilter === 'function' ? baseLaps.filter((lap) => options.lapFilter(lap) === true) : baseLaps

    const lapTimePoints = laps
        .map((lap) => ({
            lapNumber: lap?.lapNumber,
            value: toFiniteNumber(lap?.LL_Time)
        }))
        .filter((point) => Number.isFinite(point.lapNumber) && point.value !== null && point.value > 0)

    const lapTimes = lapTimePoints.map((point) => point.value)
    const bestLapTimeSec = lapTimes.length > 0 ? Math.min(...lapTimes) : null
    const medianLapTimeSec = median(lapTimes)
    const lapConsistencyStdDevSec = standardDeviation(lapTimes)
    const totalLaps = laps.length

    const recentLapTrend = lapTimePoints.slice(-lastNLaps)
    const recentXs = recentLapTrend.map((_, index) => index + 1)
    const recentYs = recentLapTrend.map((point) => point.value)
    const recentTrendRegression = linearRegression(recentXs, recentYs)

    const lapTimesWithDelta = lapTimePoints.map((point, index) => {
        const rollingWindowValues = lapTimePoints
            .slice(Math.max(0, index - 3), index)
            .map((entry) => entry.value)
        const rollingAverageSec = rollingWindowValues.length > 0
            ? rollingWindowValues.reduce((sum, value) => sum + value, 0) / rollingWindowValues.length
            : null
        return {
            lapNumber: point.lapNumber,
            lapTimeSec: point.value,
            deltaToBestSec: bestLapTimeSec === null ? null : point.value - bestLapTimeSec,
            rollingAverageSec,
            deltaToRollingAverageSec: rollingAverageSec === null ? null : point.value - rollingAverageSec
        }
    })

    const lapAhValues = laps.map((lap) => toFiniteNumber(lap?.LL_Ah)).filter((value) => value !== null)
    const lapEfficiencyValues = laps.map((lap) => toFiniteNumber(lap?.LL_Eff)).filter((value) => value !== null)

    const maxTemp = (Array.isArray(samples) ? samples : []).reduce((acc, sample) => {
        const t1 = toFiniteNumber(sample?.temp1)
        const t2 = toFiniteNumber(sample?.temp2)
        const localMax = Math.max(
            t1 === null ? -Infinity : t1,
            t2 === null ? -Infinity : t2
        )
        if (!Number.isFinite(localMax)) return acc
        return acc === null ? localMax : Math.max(acc, localMax)
    }, null)

    const maxImbalance = (Array.isArray(samples) ? samples : []).reduce((acc, sample) => {
        const imbalance = toFiniteNumber(sample?.voltageDiff)
        if (imbalance === null) return acc
        if (acc === null) return imbalance
        return Math.abs(imbalance) > Math.abs(acc) ? imbalance : acc
    }, null)

    return {
        sourceLapCount: baseLaps.length,
        totalLaps,
        bestLapTimeSec,
        medianLapTimeSec,
        lapConsistencyStdDevSec,
        lastNLaps: recentLapTrend.map((lap) => lap.value),
        lastNTrendSlopeSecPerLap: recentTrendRegression ? recentTrendRegression.slope : null,
        totalAh: lapAhValues.reduce((sum, value) => sum + value, 0),
        averageEfficiency: average(lapEfficiencyValues),
        maxTemp,
        maxImbalance,
        lapTimesWithDelta,
        degradation: {
            lapTime: computeLapDegradation(laps, 'LL_Time'),
            lapAh: computeLapDegradation(laps, 'LL_Ah'),
            lapEfficiency: computeLapDegradation(laps, 'LL_Eff')
        }
    }
}

/**
 * @brief Compute deltas between a current race and baseline race.
 * @param {Array<Object>|Object} currentLapsSource - Current race laps
 * @param {Array<Object>|Object} baselineLapsSource - Baseline race laps
 * @param {Array<Object>} [currentSamples=[]] - Current telemetry samples
 * @param {Array<Object>} [baselineSamples=[]] - Baseline telemetry samples
 * @returns {Object} Baseline comparison summary and deltas
 */
export function computeBaselineComparison(currentLapsSource, baselineLapsSource, currentSamples = [], baselineSamples = []) {
    const current = computeSessionStintKpis(currentLapsSource, currentSamples, { lastNLaps: 5 })
    const baseline = computeSessionStintKpis(baselineLapsSource, baselineSamples, { lastNLaps: 5 })
    return {
        current,
        baseline,
        deltas: {
            bestLapTimeSec: Number.isFinite(current.bestLapTimeSec) && Number.isFinite(baseline.bestLapTimeSec)
                ? current.bestLapTimeSec - baseline.bestLapTimeSec
                : null,
            medianLapTimeSec: Number.isFinite(current.medianLapTimeSec) && Number.isFinite(baseline.medianLapTimeSec)
                ? current.medianLapTimeSec - baseline.medianLapTimeSec
                : null,
            totalAh: Number.isFinite(current.totalAh) && Number.isFinite(baseline.totalAh)
                ? current.totalAh - baseline.totalAh
                : null,
            averageEfficiency: Number.isFinite(current.averageEfficiency) && Number.isFinite(baseline.averageEfficiency)
                ? current.averageEfficiency - baseline.averageEfficiency
                : null
        }
    }
}

/**
 * @brief Detect reliability events from telemetry stream.
 * @param {Array<Object>} samples - Telemetry samples sorted by timestamp
 * @param {Object} [options] - Detection thresholds and runtime options
 * @param {number} [options.undervoltageWarningV=18] - Undervoltage warning threshold
 * @param {number} [options.undervoltageCriticalV=14] - Undervoltage critical threshold
 * @param {number} [options.overTempWarningC=55] - Over-temp warning threshold
 * @param {number} [options.overTempCriticalC=65] - Over-temp critical threshold
 * @param {number} [options.currentSpikeWarningA=40] - High current warning threshold
 * @param {number} [options.currentSpikeCriticalA=120] - High current critical threshold
 * @param {number} [options.dropoutWarningSec=10] - Dropout threshold (seconds)
 * @param {number} [options.overlapWarningSec=2] - Throttle/brake overlap threshold (seconds)
 * @param {number} [options.throttleOverlapThresholdPct=5] - Overlap throttle threshold
 * @param {number} [options.brakeThreshold=0.5] - Overlap brake threshold
 * @returns {Array<Object>} Sorted reliability events
 */
export function detectReliabilityEvents(samples, options = {}) {
    const data = Array.isArray(samples) ? samples : []
    const events = []
    if (data.length === 0) return events

    const dropoutWarningSec = Number.isFinite(options.dropoutWarningSec) ? options.dropoutWarningSec : 10
    const overlapWarningSec = Number.isFinite(options.overlapWarningSec) ? options.overlapWarningSec : 2
    const throttleOverlapThresholdPct = Number.isFinite(options.throttleOverlapThresholdPct) ? options.throttleOverlapThresholdPct : 5
    const brakeThreshold = Number.isFinite(options.brakeThreshold) ? options.brakeThreshold : 0.5

    for (let i = 0; i < data.length; i += 1) {
        const sample = data[i] || {}
        const timestamp = toFiniteNumber(sample.timestamp)
        if (timestamp === null) continue

        const thresholds = evaluateChannelThresholds(sample, options)

        const voltageEvent = thresholds.voltage
        if (voltageEvent.severity !== 'info' && Number.isFinite(voltageEvent.value)) {
            events.push({
                id: `uv_${timestamp}_${i}`,
                type: 'undervoltage',
                severity: voltageEvent.severity,
                timestamp,
                title: 'Undervoltage',
                message: `Voltage dropped to ${voltageEvent.value.toFixed(2)} V`,
                value: voltageEvent.value,
                threshold: voltageEvent.severity === 'critical'
                    ? voltageEvent.criticalThreshold
                    : voltageEvent.warningThreshold
            })
        }

        const tempEvent = thresholds.temperatureMax
        if (tempEvent.severity !== 'info' && Number.isFinite(tempEvent.value)) {
            events.push({
                id: `temp_${timestamp}_${i}`,
                type: 'over_temp',
                severity: tempEvent.severity,
                timestamp,
                title: 'Over Temperature',
                message: `Temperature reached ${tempEvent.value.toFixed(1)} C`,
                value: tempEvent.value,
                threshold: tempEvent.severity === 'critical'
                    ? tempEvent.criticalThreshold
                    : tempEvent.warningThreshold
            })
        }

        const currentEvent = thresholds.current
        if (currentEvent.severity !== 'info' && Number.isFinite(currentEvent.value)) {
            events.push({
                id: `spike_${timestamp}_${i}`,
                type: 'current_spike',
                severity: currentEvent.severity,
                timestamp,
                title: 'Current Spike',
                message: `Current reached ${currentEvent.value.toFixed(1)} A`,
                value: currentEvent.value,
                threshold: currentEvent.severity === 'critical'
                    ? currentEvent.criticalThreshold
                    : currentEvent.warningThreshold
            })
        }

        if (i > 0) {
            const previous = data[i - 1] || {}
            const prevTs = toFiniteNumber(previous.timestamp)
            if (prevTs !== null) {
                const gapSec = (timestamp - prevTs) / 1000
                const severity = resolveThresholdSeverity(gapSec, dropoutWarningSec, undefined, true)
                if (severity !== 'info') {
                    events.push({
                        id: `dropout_${timestamp}_${i}`,
                        type: 'dropout',
                        severity,
                        timestamp: prevTs,
                        endTimestamp: timestamp,
                        durationSec: gapSec,
                        title: 'Telemetry Dropout',
                        message: `No packets for ${gapSec.toFixed(1)} s`,
                        value: gapSec,
                        threshold: dropoutWarningSec
                    })
                }
            }
        }
    }

    let overlapStart = null
    for (let i = 0; i < data.length; i += 1) {
        const sample = data[i] || {}
        const ts = toFiniteNumber(sample.timestamp)
        if (ts === null) continue
        const throttle = toFiniteNumber(sample.throttle)
        const brake = toFiniteNumber(sample.brake)
        const isOverlap = throttle !== null && throttle >= throttleOverlapThresholdPct && brake !== null && brake > brakeThreshold
        if (isOverlap && overlapStart === null) overlapStart = ts
        if (!isOverlap && overlapStart !== null) {
            const durationSec = (ts - overlapStart) / 1000
            const severity = resolveThresholdSeverity(durationSec, overlapWarningSec, undefined, true)
            if (severity !== 'info') {
                events.push({
                    id: `overlap_${overlapStart}_${i}`,
                    type: 'throttle_brake_overlap',
                    severity,
                    timestamp: overlapStart,
                    endTimestamp: ts,
                    durationSec,
                    title: 'Throttle + Brake Overlap',
                    message: `Overlap persisted for ${durationSec.toFixed(2)} s`,
                    value: durationSec,
                    threshold: overlapWarningSec
                })
            }
            overlapStart = null
        }
    }

    if (overlapStart !== null) {
        const lastTs = toFiniteNumber(data[data.length - 1]?.timestamp)
        if (lastTs !== null && lastTs > overlapStart) {
            const durationSec = (lastTs - overlapStart) / 1000
            const severity = resolveThresholdSeverity(durationSec, overlapWarningSec, undefined, true)
            if (severity !== 'info') {
                events.push({
                    id: `overlap_${overlapStart}_end`,
                    type: 'throttle_brake_overlap',
                    severity,
                    timestamp: overlapStart,
                    endTimestamp: lastTs,
                    durationSec,
                    title: 'Throttle + Brake Overlap',
                    message: `Overlap persisted for ${durationSec.toFixed(2)} s`,
                    value: durationSec,
                    threshold: overlapWarningSec
                })
            }
        }
    }

    return events.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
}

/**
 * @brief Build chart jump window for event navigation.
 * @param {Object} event - Reliability event entry
 * @param {Object} [options] - Jump window options
 * @param {number} [options.paddingBeforeMs=15000] - Window padding before event
 * @param {number} [options.paddingAfterMs=15000] - Window padding after event
 * @returns {{start: number, end: number}|null} Zoom window in ms
 */
export function buildEventJumpWindow(event, options = {}) {
    const timestamp = toFiniteNumber(event?.timestamp)
    if (timestamp === null) return null
    const paddingBeforeMs = Number.isFinite(options.paddingBeforeMs) ? options.paddingBeforeMs : 15000
    const paddingAfterMs = Number.isFinite(options.paddingAfterMs) ? options.paddingAfterMs : 15000
    const eventEnd = toFiniteNumber(event?.endTimestamp)
    return {
        start: Math.max(0, timestamp - paddingBeforeMs),
        end: (eventEnd === null ? timestamp : eventEnd) + paddingAfterMs
    }
}

/**
 * @brief Generate compact text summary for analytics reporting.
 * @param {Object} payload - Report inputs
 * @param {Object} payload.sessionKpis - Session KPI summary
 * @param {Object} payload.energyThermal - Energy/thermal summary
 * @param {Object} payload.overlapMetrics - Overlap summary
 * @param {Array<Object>} payload.events - Reliability events
 * @returns {string} Plain-text report
 */
export function buildAnalyticsSummaryReport(payload = {}) {
    const sessionKpis = payload.sessionKpis || {}
    const energyThermal = payload.energyThermal || {}
    const overlapMetrics = payload.overlapMetrics || {}
    const events = Array.isArray(payload.events) ? payload.events : []

    return [
        'eChook Analytics Summary',
        `Best lap: ${Number.isFinite(sessionKpis.bestLapTimeSec) ? sessionKpis.bestLapTimeSec.toFixed(2) : '-'} s`,
        `Median lap: ${Number.isFinite(sessionKpis.medianLapTimeSec) ? sessionKpis.medianLapTimeSec.toFixed(2) : '-'} s`,
        `Consistency (std dev): ${Number.isFinite(sessionKpis.lapConsistencyStdDevSec) ? sessionKpis.lapConsistencyStdDevSec.toFixed(2) : '-'}`,
        `Total laps: ${Number.isFinite(sessionKpis.totalLaps) ? sessionKpis.totalLaps : 0}`,
        `Total Ah: ${Number.isFinite(sessionKpis.totalAh) ? sessionKpis.totalAh.toFixed(2) : '-'}`,
        `Average efficiency: ${Number.isFinite(sessionKpis.averageEfficiency) ? sessionKpis.averageEfficiency.toFixed(2) : '-'}`,
        `Total energy: ${Number.isFinite(energyThermal.totalWh) ? energyThermal.totalWh.toFixed(2) : '-'} Wh`,
        `Wh per mile: ${Number.isFinite(energyThermal.whPerMile) ? energyThermal.whPerMile.toFixed(2) : '-'}`,
        `Overlap events: ${Number.isFinite(overlapMetrics.eventCount) ? overlapMetrics.eventCount : 0}`,
        `Reliability events: ${events.length}`
    ].join('\n')
}

/**
 * @brief Compute energy and thermal summary cards from telemetry samples.
 * @param {Array<Object>} samples - Telemetry samples sorted by timestamp
 * @param {Object} [options] - Summary options
 * @param {'mph'|'kph'|'ms'} [options.speedUnit='mph'] - Speed unit used by samples
 * @param {number} [options.maxDtMs=10000] - Max interval duration for integration
 * @returns {Object} Energy and thermal summary values
 */
export function computeEnergyThermalSummary(samples, options = {}) {
    const speedUnit = options.speedUnit || 'mph'
    const maxDtMs = Number.isFinite(options.maxDtMs) ? options.maxDtMs : 10000
    const data = Array.isArray(samples) ? samples : []

    if (data.length < 2) {
        return {
            totalWh: 0,
            avgPowerW: null,
            peakPowerW: null,
            distanceMiles: 0,
            whPerMile: null,
            avgVoltage: null,
            avgCurrent: null,
            maxVoltageDiff: null,
            avgVoltageDiff: null,
            maxTemp: null,
            tempRisePerMin: null
        }
    }

    let totalMs = 0
    let totalWh = 0
    let distanceMiles = 0
    let peakPowerW = null
    const voltageValues = []
    const currentValues = []
    const imbalanceValues = []
    const tempSeries = []

    for (let i = 0; i < data.length - 1; i += 1) {
        const sample = data[i] || {}
        const nextSample = data[i + 1] || {}
        const ts = toFiniteNumber(sample.timestamp)
        const nextTs = toFiniteNumber(nextSample.timestamp)
        if (ts === null || nextTs === null) continue
        const dtMs = nextTs - ts
        if (!isValidDuration(dtMs, maxDtMs)) continue

        const voltage = toFiniteNumber(sample.voltage)
        const current = toFiniteNumber(sample.current)
        const powerW = voltage === null || current === null ? null : voltage * current
        if (powerW !== null) {
            peakPowerW = peakPowerW === null ? powerW : Math.max(peakPowerW, powerW)
        }

        totalWh += intervalWh(voltage, current, dtMs, false)
        totalMs += dtMs

        const speed = toFiniteNumber(sample.speed)
        if (speed !== null) {
            const speedMph = speedToMph(speed, speedUnit)
            distanceMiles += speedMph * (dtMs / 3600000)
        }

        if (voltage !== null) voltageValues.push(voltage)
        if (current !== null) currentValues.push(current)
        const imbalance = toFiniteNumber(sample.voltageDiff)
        if (imbalance !== null) imbalanceValues.push(imbalance)

        const t1 = toFiniteNumber(sample.temp1)
        const t2 = toFiniteNumber(sample.temp2)
        const tempValue = average([t1, t2])
        if (tempValue !== null) {
            tempSeries.push({ timestamp: ts, temp: tempValue })
        }
    }

    let tempRisePerMin = null
    if (tempSeries.length >= 2) {
        const start = tempSeries[0]
        const end = tempSeries[tempSeries.length - 1]
        const dtMinutes = (end.timestamp - start.timestamp) / 60000
        if (dtMinutes > 0) {
            tempRisePerMin = (end.temp - start.temp) / dtMinutes
        }
    }

    const avgPowerW = totalMs > 0 ? (totalWh * 3600000) / totalMs : null

    return {
        totalWh,
        avgPowerW,
        peakPowerW,
        distanceMiles,
        whPerMile: distanceMiles > 0 ? totalWh / distanceMiles : null,
        avgVoltage: average(voltageValues),
        avgCurrent: average(currentValues),
        maxVoltageDiff: imbalanceValues.reduce((acc, imbalance) => {
            if (!Number.isFinite(imbalance)) return acc
            if (acc === null) return imbalance
            return Math.abs(imbalance) > Math.abs(acc) ? imbalance : acc
        }, null),
        avgVoltageDiff: average(imbalanceValues),
        maxTemp: tempSeries.length > 0 ? Math.max(...tempSeries.map((entry) => entry.temp)) : null,
        tempRisePerMin
    }
}

