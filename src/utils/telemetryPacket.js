/**
 * @file telemetryPacket.js
 * @brief Shared telemetry packet normalization helpers.
 */

/**
 * @brief Normalize telemetry packet fields into a stable shape.
 * @description Applies key aliases, numeric-string coercion, and timestamp fallback.
 * @param {Object} rawPacket - Raw telemetry packet from socket or history API
 * @returns {Object|null} Normalized packet or null when input is invalid
 */
export function normalizeTelemetryPacket(rawPacket) {
    if (!rawPacket || typeof rawPacket !== 'object' || Array.isArray(rawPacket)) return null

    const packet = { ...rawPacket }

    // Normalize key casing used by legacy senders.
    if (packet.Lon !== undefined && packet.lon === undefined) packet.lon = packet.Lon
    if (packet.Lat !== undefined && packet.lat === undefined) packet.lat = packet.Lat
    if (packet.Track !== undefined && packet.track === undefined) packet.track = packet.Track
    if (packet.Circuit !== undefined && packet.track === undefined) packet.track = packet.Circuit

    Object.keys(packet).forEach((key) => {
        const value = packet[key]
        if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
            packet[key] = Number(value)
        }
    })

    const timestamp = packet.timestamp || packet.updated
    if (timestamp !== undefined) {
        packet.timestamp = Number(timestamp)
    }

    return packet
}

/**
 * @brief Extract regular telemetry fields from a normalized packet.
 * @description Shared by live socket and history paths to keep field-selection
 *              behavior consistent across ingestion sources.
 * @param {Object} packet - Normalized telemetry packet
 * @param {Set<string>} regularKeys - Allowed non-lap telemetry keys
 * @param {number} timestamp - Timestamp to force on output packet
 * @returns {Object} Reduced telemetry packet containing regular keys and timestamp
 */
export function extractRegularTelemetryPacket(packet, regularKeys, timestamp) {
    const regularPacket = { timestamp }
    if (!packet || typeof packet !== 'object') return regularPacket
    regularKeys.forEach((key) => {
        if (packet[key] !== undefined) {
            regularPacket[key] = packet[key]
        }
    })
    if (packet.lat !== undefined) regularPacket.lat = packet.lat
    if (packet.lon !== undefined) regularPacket.lon = packet.lon
    return regularPacket
}
