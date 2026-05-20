/**
 * @file analyticsMetrics.js
 * @brief Derived analytics metric helpers for race telemetry.
 * @description Pure utility functions used by analytics and laps views to
 *              compute histogram, overlap, race start, acceleration and
 *              supply-resistance insights from existing telemetry packets.
 */

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

    const start = detectRaceStart(samples, options)
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

/**
 * @brief Compute rolling supply resistance estimate from V-I behavior.
 * @param {Array<Object>} samples - Telemetry points sorted by timestamp
 * @param {Object} [options] - Resistance estimation options
 * @param {number} [options.minSampleCount=8] - Min sample count for fit
 * @param {number} [options.minCurrentSpread=5] - Min current spread in amps
 * @param {number} [options.rollingWindowSize=12] - Rolling window sample count
 * @param {number} [options.rollingStep=4] - Rolling window step
 * @returns {Object} Resistance estimate with confidence and trend
 */
export function computeSupplyResistance(samples, options = {}) {
    const minSampleCount = Number.isFinite(options.minSampleCount) ? Math.max(2, Math.round(options.minSampleCount)) : 8
    const minCurrentSpread = Number.isFinite(options.minCurrentSpread) ? options.minCurrentSpread : 5
    const rollingWindowSize = Number.isFinite(options.rollingWindowSize) ? Math.max(4, Math.round(options.rollingWindowSize)) : 12
    const rollingStep = Number.isFinite(options.rollingStep) ? Math.max(1, Math.round(options.rollingStep)) : 4

    const filtered = (Array.isArray(samples) ? samples : [])
        .map((sample) => ({
            timestamp: toFiniteNumber(sample?.timestamp),
            voltage: toFiniteNumber(sample?.voltage),
            current: toFiniteNumber(sample?.current)
        }))
        .filter((sample) => sample.timestamp !== null && sample.voltage !== null && sample.current !== null)

    if (filtered.length < minSampleCount) {
        return {
            valid: false,
            reason: 'insufficient_samples',
            sampleCount: filtered.length
        }
    }

    const currents = filtered.map((sample) => sample.current)
    const voltages = filtered.map((sample) => sample.voltage)
    const currentSpread = Math.max(...currents) - Math.min(...currents)

    if (currentSpread < minCurrentSpread) {
        return {
            valid: false,
            reason: 'insufficient_current_spread',
            sampleCount: filtered.length,
            currentSpread
        }
    }

    const fit = linearRegression(currents, voltages)
    if (!fit) {
        return {
            valid: false,
            reason: 'fit_failed',
            sampleCount: filtered.length
        }
    }

    const rOhm = -fit.slope
    if (!Number.isFinite(rOhm) || rOhm <= 0) {
        return {
            valid: false,
            reason: 'non_physical_resistance',
            sampleCount: filtered.length,
            fitR2: fit.r2
        }
    }

    const rolling = []
    if (filtered.length >= rollingWindowSize) {
        for (let i = 0; i <= filtered.length - rollingWindowSize; i += rollingStep) {
            const window = filtered.slice(i, i + rollingWindowSize)
            const xs = window.map((point) => point.current)
            const ys = window.map((point) => point.voltage)
            const spread = Math.max(...xs) - Math.min(...xs)
            if (spread < minCurrentSpread) continue
            const windowFit = linearRegression(xs, ys)
            if (!windowFit) continue
            const windowROhm = -windowFit.slope
            if (!Number.isFinite(windowROhm) || windowROhm <= 0) continue
            rolling.push({
                timestamp: window[Math.floor(window.length / 2)].timestamp,
                rMilliOhm: windowROhm * 1000,
                fitR2: windowFit.r2
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

    let confidence = 'low'
    if (fit.r2 >= 0.8 && filtered.length >= 20 && currentSpread >= 10) confidence = 'high'
    else if (fit.r2 >= 0.5 && filtered.length >= minSampleCount) confidence = 'medium'

    return {
        valid: true,
        sampleCount: filtered.length,
        fitR2: fit.r2,
        currentSpread,
        rMilliOhm: rOhm * 1000,
        openCircuitVoltage: fit.intercept,
        confidence,
        trend: {
            slopeMilliOhmPerMin: trendSlopeMilliOhmPerMin,
            deltaRMilliOhm
        },
        rolling
    }
}

