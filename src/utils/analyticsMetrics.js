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
        return acc === null ? imbalance : Math.max(acc, imbalance)
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
 * @brief Resolve event severity from value against warning/critical bounds.
 * @param {number} value - Measured value
 * @param {number} warningThreshold - Warning threshold
 * @param {number} criticalThreshold - Critical threshold
 * @param {boolean} [higherIsWorse=true] - Threshold direction
 * @returns {'info'|'warning'|'critical'} Severity label
 */
function resolveSeverity(value, warningThreshold, criticalThreshold, higherIsWorse = true) {
    if (!Number.isFinite(value)) return 'info'
    if (higherIsWorse) {
        if (Number.isFinite(criticalThreshold) && value >= criticalThreshold) return 'critical'
        if (Number.isFinite(warningThreshold) && value >= warningThreshold) return 'warning'
        return 'info'
    }
    if (Number.isFinite(criticalThreshold) && value <= criticalThreshold) return 'critical'
    if (Number.isFinite(warningThreshold) && value <= warningThreshold) return 'warning'
    return 'info'
}

/**
 * @brief Detect reliability events from telemetry stream.
 * @param {Array<Object>} samples - Telemetry samples sorted by timestamp
 * @param {Object} [options] - Detection thresholds and runtime options
 * @param {number} [options.undervoltageWarningV=18] - Undervoltage warning threshold
 * @param {number} [options.undervoltageCriticalV=14] - Undervoltage critical threshold
 * @param {number} [options.overTempWarningC=55] - Over-temp warning threshold
 * @param {number} [options.overTempCriticalC=65] - Over-temp critical threshold
 * @param {number} [options.currentSpikeWarningA=40] - Current spike warning delta
 * @param {number} [options.currentSpikeCriticalA=120] - Current spike critical delta
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

    const undervoltageWarningV = Number.isFinite(options.undervoltageWarningV) ? options.undervoltageWarningV : 18
    const undervoltageCriticalV = Number.isFinite(options.undervoltageCriticalV) ? options.undervoltageCriticalV : 14
    const overTempWarningC = Number.isFinite(options.overTempWarningC) ? options.overTempWarningC : 55
    const overTempCriticalC = Number.isFinite(options.overTempCriticalC) ? options.overTempCriticalC : 65
    const currentSpikeWarningA = Number.isFinite(options.currentSpikeWarningA) ? options.currentSpikeWarningA : 40
    const currentSpikeCriticalA = Number.isFinite(options.currentSpikeCriticalA) ? options.currentSpikeCriticalA : 120
    const dropoutWarningSec = Number.isFinite(options.dropoutWarningSec) ? options.dropoutWarningSec : 10
    const overlapWarningSec = Number.isFinite(options.overlapWarningSec) ? options.overlapWarningSec : 2
    const throttleOverlapThresholdPct = Number.isFinite(options.throttleOverlapThresholdPct) ? options.throttleOverlapThresholdPct : 5
    const brakeThreshold = Number.isFinite(options.brakeThreshold) ? options.brakeThreshold : 0.5

    for (let i = 0; i < data.length; i += 1) {
        const sample = data[i] || {}
        const timestamp = toFiniteNumber(sample.timestamp)
        if (timestamp === null) continue

        const voltage = toFiniteNumber(sample.voltage)
        if (voltage !== null) {
            const severity = resolveSeverity(voltage, undervoltageWarningV, undervoltageCriticalV, false)
            if (severity !== 'info') {
                events.push({
                    id: `uv_${timestamp}_${i}`,
                    type: 'undervoltage',
                    severity,
                    timestamp,
                    title: 'Undervoltage',
                    message: `Voltage dropped to ${voltage.toFixed(2)} V`,
                    value: voltage,
                    threshold: severity === 'critical' ? undervoltageCriticalV : undervoltageWarningV
                })
            }
        }

        const temp1 = toFiniteNumber(sample.temp1)
        const temp2 = toFiniteNumber(sample.temp2)
        const maxTemp = Math.max(temp1 === null ? -Infinity : temp1, temp2 === null ? -Infinity : temp2)
        if (Number.isFinite(maxTemp)) {
            const severity = resolveSeverity(maxTemp, overTempWarningC, overTempCriticalC, true)
            if (severity !== 'info') {
                events.push({
                    id: `temp_${timestamp}_${i}`,
                    type: 'over_temp',
                    severity,
                    timestamp,
                    title: 'Over Temperature',
                    message: `Temperature reached ${maxTemp.toFixed(1)} C`,
                    value: maxTemp,
                    threshold: severity === 'critical' ? overTempCriticalC : overTempWarningC
                })
            }
        }

        if (i > 0) {
            const previous = data[i - 1] || {}
            const prevCurrent = toFiniteNumber(previous.current)
            const current = toFiniteNumber(sample.current)
            if (prevCurrent !== null && current !== null) {
                const deltaCurrent = Math.abs(current - prevCurrent)
                const severity = resolveSeverity(deltaCurrent, currentSpikeWarningA, currentSpikeCriticalA, true)
                if (severity !== 'info') {
                    events.push({
                        id: `spike_${timestamp}_${i}`,
                        type: 'current_spike',
                        severity,
                        timestamp,
                        title: 'Current Spike',
                        message: `Current changed by ${deltaCurrent.toFixed(1)} A`,
                        value: deltaCurrent,
                        threshold: severity === 'critical' ? currentSpikeCriticalA : currentSpikeWarningA
                    })
                }
            }

            const prevTs = toFiniteNumber(previous.timestamp)
            if (prevTs !== null) {
                const gapSec = (timestamp - prevTs) / 1000
                const severity = resolveSeverity(gapSec, dropoutWarningSec, undefined, true)
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
            const severity = resolveSeverity(durationSec, overlapWarningSec, undefined, true)
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
            const severity = resolveSeverity(durationSec, overlapWarningSec, undefined, true)
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
        `Consistency (std dev): ${Number.isFinite(sessionKpis.lapConsistencyStdDevSec) ? sessionKpis.lapConsistencyStdDevSec.toFixed(3) : '-'}`,
        `Total laps: ${Number.isFinite(sessionKpis.totalLaps) ? sessionKpis.totalLaps : 0}`,
        `Total Ah: ${Number.isFinite(sessionKpis.totalAh) ? sessionKpis.totalAh.toFixed(3) : '-'}`,
        `Average efficiency: ${Number.isFinite(sessionKpis.averageEfficiency) ? sessionKpis.averageEfficiency.toFixed(3) : '-'}`,
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
        maxVoltageDiff: imbalanceValues.length > 0 ? Math.max(...imbalanceValues) : null,
        avgVoltageDiff: average(imbalanceValues),
        maxTemp: tempSeries.length > 0 ? Math.max(...tempSeries.map((entry) => entry.temp)) : null,
        tempRisePerMin
    }
}

