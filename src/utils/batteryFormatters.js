/**
 * @file utils/batteryFormatters.js
 * @brief Display helpers for battery store UI fields.
 */

/** @brief Month options for manufacture date pickers (1 = January). */
export const BATTERY_MANUFACTURE_MONTHS = Object.freeze([
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' }
])

/**
 * @brief Build selectable manufacture years, newest first.
 * @param {number} [spanYears=30] - How many years back from the current year to include
 * @returns {number[]} Four-digit years in descending order
 */
export function getBatteryManufactureYears(spanYears = 30) {
    const currentYear = new Date().getFullYear()
    const startYear = currentYear - spanYears
    const years = []
    for (let year = currentYear + 1; year >= startYear; year -= 1) {
        years.push(year)
    }
    return years
}

/**
 * @brief Current four-digit year for manufacture date defaults.
 * @returns {number}
 */
export function getCurrentManufactureYear() {
    return new Date().getFullYear()
}

/**
 * @brief Current month number (1–12) for manufacture date defaults.
 * @returns {number}
 */
export function getCurrentManufactureMonth() {
    return new Date().getMonth() + 1
}

/**
 * @brief Parse API date stamp string (YY-MM) into month and year parts.
 * @param {string|null|undefined} dateStamp - Stored stamp, e.g. "26-07" for July 2026
 * @returns {{month: number, year: number}|null} Parsed parts or null when invalid
 */
export function parseDateStamp(dateStamp) {
    if (!dateStamp || typeof dateStamp !== 'string') return null
    const match = dateStamp.trim().match(/^(\d{2})-(\d{2})$/)
    if (!match) return null

    const month = Number(match[2])
    if (!Number.isInteger(month) || month < 1 || month > 12) return null

    const year = 2000 + Number(match[1])
    return { month, year }
}

/**
 * @brief Format month and year into API date stamp string (YY-MM).
 * @param {number|string|null|undefined} month - Month 1–12
 * @param {number|string|null|undefined} year - Four-digit year
 * @returns {string} Date stamp or empty string when incomplete
 */
export function formatDateStamp(month, year) {
    const monthNumber = Number(month)
    const yearNumber = Number(year)
    if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) return ''
    if (!Number.isInteger(yearNumber) || yearNumber < 2000 || yearNumber > 2099) return ''

    const yy = String(yearNumber % 100).padStart(2, '0')
    const mm = String(monthNumber).padStart(2, '0')
    return `${yy}-${mm}`
}

/**
 * @brief Human-readable label for a stored date stamp.
 * @param {string|null|undefined} dateStamp - Stored stamp (YY-MM)
 * @returns {string} Display label
 */
export function formatDateStampLabel(dateStamp) {
    const parsed = parseDateStamp(dateStamp)
    if (!parsed) return dateStamp || '—'
    const monthLabel = BATTERY_MANUFACTURE_MONTHS[parsed.month - 1]?.label ?? ''
    return `${monthLabel} ${parsed.year}`
}

/**
 * @brief Default manufacture date stamp for new batteries (current month).
 * @returns {string} YY-MM date stamp
 */
export function defaultManufactureDateStamp() {
    return formatDateStamp(getCurrentManufactureMonth(), getCurrentManufactureYear())
}

/**
 * @brief Resolve a stored date stamp, falling back to the current month when missing.
 * @param {string|null|undefined} dateStamp - Stored stamp (YY-MM)
 * @returns {string} Valid YY-MM stamp
 */
export function resolveManufactureDateStamp(dateStamp) {
    return parseDateStamp(dateStamp) ? dateStamp.trim() : defaultManufactureDateStamp()
}

/**
 * @brief Parse server manufacture date values into a UTC Date.
 * @param {string|null|undefined} manufactureDate - ISO date or datetime string
 * @returns {Date|null} Parsed date or null when invalid
 */
function parseManufactureDate(manufactureDate) {
    if (!manufactureDate) return null
    const value = String(manufactureDate).trim()
    if (!value) return null

    const datePrefix = value.match(/^(\d{4}-\d{2}-\d{2})/)
    const normalized = datePrefix ? `${datePrefix[1]}T00:00:00Z` : value
    const parsed = new Date(normalized)
    return Number.isNaN(parsed.getTime()) ? null : parsed
}

/**
 * @brief Compute whole-month age from a UTC month start date.
 * @param {Date} manufactured - First day of manufacture month (UTC)
 * @returns {string} Age label
 */
function formatAgeFromManufactureDate(manufactured) {
    const now = new Date()
    let months = (now.getUTCFullYear() - manufactured.getUTCFullYear()) * 12
    months += now.getUTCMonth() - manufactured.getUTCMonth()
    if (now.getUTCDate() < manufactured.getUTCDate()) {
        months -= 1
    }
    if (months < 0) return 'Unknown'
    if (months < 12) return `${months} month${months === 1 ? '' : 's'}`
    const years = Math.floor(months / 12)
    const rem = months % 12
    if (rem === 0) return `${years} year${years === 1 ? '' : 's'}`
    return `${years}y ${rem}m`
}

/**
 * @brief Format a manufacture date or date stamp as a human-readable age string.
 * @param {string|null|undefined} manufactureDate - ISO date YYYY-MM-DD
 * @param {string|null|undefined} dateStamp - Manufacturer YY-MM stamp fallback
 * @returns {string} Age label for table display
 */
export function formatBatteryAge(manufactureDate, dateStamp = null) {
    const stamped = parseDateStamp(dateStamp)
    if (stamped) {
        const manufactured = new Date(Date.UTC(stamped.year, stamped.month - 1, 1))
        return formatAgeFromManufactureDate(manufactured)
    }

    const manufactured = parseManufactureDate(manufactureDate)
    if (manufactured) {
        return formatAgeFromManufactureDate(manufactured)
    }

    return 'Unknown'
}

/**
 * @brief Format an epoch ms timestamp as a relative time phrase.
 * @param {number|null|undefined} timestampMs - Epoch milliseconds
 * @returns {string} Relative time label
 */
export function formatRelativeTime(timestampMs) {
    if (!Number.isFinite(timestampMs)) return 'Never'
    const diffMs = Date.now() - timestampMs
    if (diffMs < 0) return 'Just now'
    const seconds = Math.floor(diffMs / 1000)
    if (seconds < 60) return 'Just now'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`
    const months = Math.floor(days / 30)
    if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`
    const years = Math.floor(months / 12)
    return `${years} year${years === 1 ? '' : 's'} ago`
}

/**
 * @brief Pad a number to two digits for HTML date/time input values.
 * @param {number} value - Value to pad
 * @returns {string} Two-digit string
 */
function padInputTwo(value) {
    return String(value).padStart(2, '0')
}

/**
 * @brief Format epoch ms for an HTML date input (YYYY-MM-DD, local time).
 * @param {number} [timestampMs=Date.now()] - Epoch ms
 * @returns {string} Value suitable for type="date"
 */
export function msToDateInput(timestampMs = Date.now()) {
    const date = new Date(timestampMs)
    return `${date.getFullYear()}-${padInputTwo(date.getMonth() + 1)}-${padInputTwo(date.getDate())}`
}

/**
 * @brief Format epoch ms for an HTML time input (HH:mm, local time).
 * @param {number} [timestampMs=Date.now()] - Epoch ms
 * @returns {string} Value suitable for type="time"
 */
export function msToTimeInput(timestampMs = Date.now()) {
    const date = new Date(timestampMs)
    return `${padInputTwo(date.getHours())}:${padInputTwo(date.getMinutes())}`
}

/**
 * @brief Combine date and time input values into epoch milliseconds.
 * @param {string|null|undefined} dateValue - YYYY-MM-DD from type="date"
 * @param {string|null|undefined} timeValue - HH:mm from type="time"
 * @returns {number|null} Epoch ms, or null when inputs are incomplete/invalid
 */
export function combineDateTimeInput(dateValue, timeValue) {
    if (!dateValue || !timeValue) return null
    const parsed = new Date(`${dateValue}T${timeValue}`).getTime()
    return Number.isFinite(parsed) ? parsed : null
}

/**
 * @brief Format a floating-point stat value to a fixed number of decimal places.
 * @param {number|null|undefined} value - Stat value from store or API
 * @param {number} [decimals=2] - Number of decimal places to display
 * @returns {string} Formatted string or '—' when the value is not a finite number
 */
export function formatStatValue(value, decimals = 2) {
    return Number.isFinite(value) ? Number(value).toFixed(decimals) : '—'
}

/**
 * @brief Convert a datetime-local input value to epoch ms.
 * @param {string} localValue - Value from datetime-local input
 * @returns {number} Epoch ms, or Date.now() when invalid
 */
export function datetimeLocalToMs(localValue) {
    if (!localValue) return Date.now()
    const parsed = new Date(localValue).getTime()
    return Number.isFinite(parsed) ? parsed : Date.now()
}

/**
 * @brief Format epoch ms for datetime-local input value.
 * @param {number} [timestampMs=Date.now()] - Epoch ms
 * @returns {string} Value suitable for datetime-local input
 */
export function msToDatetimeLocal(timestampMs = Date.now()) {
    const date = new Date(timestampMs)
    const pad = (value) => String(value).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
