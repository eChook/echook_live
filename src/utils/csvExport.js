/**
 * @file csvExport.js
 * @brief CSV export functionality for telemetry data.
 * @description Provides utilities for exporting telemetry history data to CSV files
 *              with proper formatting, headers, units, and automatic file download.
 */

import { useTelemetryStore } from '../stores/telemetry'

/**
 * @brief Export a range of telemetry history to a CSV file.
 * @description Filters telemetry data by timestamp range, generates a CSV with
 *              appropriate headers and units, and triggers a browser download.
 *              
 *              Features:
 *              - Automatic column ordering based on preferred telemetry display order
 *              - Excludes internal keys (id, carId, _id, timestamp, updated, car)
 *              - Includes both raw timestamp (ms) and ISO formatted time
 *              - Infers units from current telemetry settings
 *              - Handles CSV special characters (commas in values)
 *              - Generates descriptive filename with track and date
 * 
 * @param {number} startTime - Start timestamp in milliseconds (inclusive)
 * @param {number} endTime - End timestamp in milliseconds (inclusive)
 * @param {string} [filenamePrefix='eChook'] - Prefix for the generated filename
 * @param {string} [trackName='unknown-track'] - Track name to include in filename
 * @returns {boolean} true if export succeeded, false if no data in range
 * 
 * @example
 * // Export last hour of data
 * const now = Date.now()
 * exportHistoryAsCsv(now - 3600000, now, 'telemetry', 'Rockingham')
 * // Downloads: telemetry-rockingham-2024-01-15T10-30-00.csv
 */
export function exportHistoryAsCsv(startTime, endTime, filenamePrefix = 'eChook', trackName = 'unknown-track') {
    const telemetry = useTelemetryStore()

    // 1. Filter Data
    const history = telemetry.history
    const data = history.filter(pt => pt.timestamp >= startTime && pt.timestamp <= endTime)

    if (data.length === 0) {
        console.warn('No data found for CSV export in range', { startTime, endTime })
        return false
    }

    /**
     * @brief Preferred column ordering for CSV output.
     * @description Columns are ordered logically by category:
     *              electrical (voltage, current, ampH), mechanical (speed, rpm, throttle),
     *              battery details, thermal, then location/track data.
     * @type {string[]}
     */
    const PREFERRED_ORDER = [
        'voltage', 'current', 'ampH',
        'speed', 'rpm', 'throttle', 'voltageLower',
        'voltageHigh', 'voltageDiff', 'gear', 'brake',
        'temp1', 'temp2', 'tempDiff',
        'currLap', 'lat', 'lon', 'track'
    ]

    /**
     * @brief Keys excluded from CSV export.
     * @description Internal identifiers and metadata that shouldn't be in exports.
     * @type {Set<string>}
     */
    const EXCLUDED_KEYS = new Set(['id', 'carId', '_id', 'timestamp', 'updated', 'car'])

    // 2. Collect Keys
    const allKeys = new Set()
    data.forEach(pt => Object.keys(pt).forEach(k => {
        if (!EXCLUDED_KEYS.has(k)) {
            allKeys.add(k)
        }
    }))

    // Sort keys based on preferred order, then alphabetical for others
    const keys = Array.from(allKeys).sort((a, b) => {
        const idxA = PREFERRED_ORDER.indexOf(a)
        const idxB = PREFERRED_ORDER.indexOf(b)

        // If both in preferred list, sort by index
        if (idxA !== -1 && idxB !== -1) return idxA - idxB

        // If one is preferred, it comes first
        if (idxA !== -1) return -1
        if (idxB !== -1) return 1

        // Otherwise alphabetical
        return a.localeCompare(b)
    })

    // 3. Build Headers with Units
    // Prepend timestamp headers
    const headers = ['Timestamp (ms)', 'ISO Time']

    keys.forEach(k => {
        const label = telemetry.getDisplayName(k)
        let unit = ''

        // Infer units from current settings
        // Ideally we'd have a getUnit helper from store, but we can replicate logic or check if store exports it
        if (k === 'speed') unit = telemetry.unitSettings.speedUnit
        else if (k.startsWith('temp')) unit = telemetry.unitSettings.tempUnit === 'f' ? '°F' : '°C'
        else if (k === 'rpm') unit = 'RPM'
        else if (k === 'voltage' || k.startsWith('voltage')) unit = 'V'
        else if (k === 'current') unit = 'A'
        else if (k === 'ampH') unit = 'Ah'

        headers.push(unit ? `${label} (${unit})` : label)
    })

    // 4. Build Rows
    const rows = data.map(pt => {
        const row = []

        // Timestamps
        row.push(pt.timestamp)
        row.push(new Date(pt.timestamp).toISOString())

        // Values
        keys.forEach(k => {
            let val = pt[k]
            if (val === undefined || val === null) {
                row.push('')
            } else {
                row.push(val)
            }
        })

        return row.map(cell => {
            // Escape quotes if needed, though mostly numbers
            const str = String(cell)
            if (str.includes(',')) return `"${str}"`
            return str
        }).join(',')
    })

    // 5. Create Blob and Download
    const csvContent = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })

    const trackSlug = (trackName || 'unknown-track').replace(/[^a-z0-9]/gi, '-').toLowerCase()
    const dateSlug = new Date(startTime).toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const filename = `${filenamePrefix}-${trackSlug}-${dateSlug}.csv`

    const link = document.createElement("a")
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob)
        link.setAttribute("href", url)
        link.setAttribute("download", filename)
        link.style.visibility = 'hidden'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
    }

    return true
}
