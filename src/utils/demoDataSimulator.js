/**
 * @file utils/demoDataSimulator.js
 * @brief Generates plausible-looking fake telemetry packets for local demoing.
 * @description Not intended to be physically accurate — just enough variation
 *              and correlation between channels (throttle/speed/current/rpm,
 *              periodic laps) that the dashboard looks alive without a real car.
 */

const LAP_DURATION_MS = 25000

/** @brief Mutable simulator state, reset each time demo mode starts. */
let state = null

/**
 * @brief Reset internal simulator state.
 * @description Call before starting a new demo session so packets don't
 *              continue from a stale previous run.
 */
export function resetDemoState() {
    state = {
        startTime: Date.now(),
        lapStartTime: Date.now(),
        currLap: 1,
        voltage: 25.2,
        throttle: 0,
        current: 0,
        temp1: 22,
        temp2: 22,
        ampH: 0
    }
}

/**
 * @brief Clamp a value between bounds.
 */
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value))
}

/**
 * @brief Random value in [-1, 1], biased toward small steps for a smoother walk.
 */
function randomStep() {
    return (Math.random() - 0.5) * 2
}

/**
 * @brief Generate the next synthetic telemetry packet.
 * @description Advances internal state by one tick and derives a full packet.
 *              Emits LL_* lap-summary fields on the tick that completes a lap.
 * @returns {Object} Plain packet in the same shape as a normalized live packet
 */
export function generateDemoPacket() {
    if (!state) resetDemoState()

    const now = Date.now()

    // Throttle random-walks with an occasional lift-and-brake.
    state.throttle = clamp(state.throttle + randomStep() * 15, 0, 100)
    const isBraking = state.throttle < 20 && Math.random() < 0.3
    const brake = isBraking ? 1 : 0

    const speed = clamp((state.throttle / 100) * 45 + randomStep() * 2, 0, 50)
    const rpm = Math.round(speed * 140 + randomStep() * 100)

    state.current = clamp(
        (state.throttle / 100) * 70 + (isBraking ? -10 : 0) + randomStep() * 5,
        -15,
        90
    )

    // Voltage sags slightly under load and slowly drains over the session.
    const sessionMinutes = (now - state.startTime) / 60000
    state.voltage = clamp(
        25.5 - (state.current / 90) * 1.2 - sessionMinutes * 0.02 + randomStep() * 0.05,
        20,
        26
    )

    state.temp1 = clamp(state.temp1 + randomStep() * 0.3 + 0.01, 15, 65)
    state.temp2 = clamp(state.temp2 + randomStep() * 0.3 + 0.01, 15, 65)

    state.ampH = clamp(state.ampH + Math.max(0, state.current) / 3600, 0, 999)

    const packet = {
        timestamp: now,
        voltage: Number(state.voltage.toFixed(2)),
        current: Number(state.current.toFixed(1)),
        ampH: Number(state.ampH.toFixed(3)),
        speed: Number(speed.toFixed(1)),
        rpm,
        throttle: Number(state.throttle.toFixed(0)),
        brake,
        gear: clamp(Math.round(1 + speed / 15), 1, 4),
        temp1: Number(state.temp1.toFixed(1)),
        temp2: Number(state.temp2.toFixed(1)),
        voltageLower: Number((state.voltage * 0.48).toFixed(2)),
        currLap: state.currLap,
        track: 'Demo Circuit'
    }

    // Complete a lap periodically and emit a lap summary alongside the packet.
    if (now - state.lapStartTime >= LAP_DURATION_MS) {
        const lapTimeSec = (now - state.lapStartTime) / 1000
        packet.LL_Time = Number(lapTimeSec.toFixed(2))
        packet.LL_V = packet.voltage
        packet.LL_I = Math.abs(packet.current)
        packet.LL_RPM = rpm
        packet.LL_Spd = packet.speed
        packet.LL_Ah = packet.ampH
        packet.LL_Wh = Number((packet.voltage * Math.abs(packet.current) * (lapTimeSec / 3600)).toFixed(1))

        state.currLap += 1
        state.lapStartTime = now
        packet.currLap = state.currLap
    }

    return packet
}
