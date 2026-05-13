/**
 * @file constants/chartTheme.js
 * @brief Centralized ECharts color tokens for light and dark UI themes.
 * @description Provides consistent axis, grid, tooltip, zoom-slider, and lap
 *              highlight colors. Series line hues stay recognizable; light mode
 *              uses slightly deeper tones where needed for contrast on white.
 */

/** @typedef {'light' | 'dark'} ChartThemeId */

/**
 * @brief Dark dashboard chart chrome (matches existing app neutrals).
 * @type {Readonly<ChartThemeTokens>}
 */
const darkTokens = Object.freeze({
    canvas: '#171717',
    axisLine: '#525252',
    axisLabel: '#a3a3a3',
    grid: '#262626',
    tooltipBg: 'rgba(23, 23, 23, 0.92)',
    tooltipBorder: '#333333',
    tooltipText: '#f5f5f5',
    /** @brief Muted unit text inside tooltip HTML (no Tailwind in ECharts). */
    tooltipUnit: '#a3a3a3',
    markAreaLabel: '#737373',
    zoomBorder: '#404040',
    zoomText: '#a3a3a3',
    zoomHandle: '#cb1557',
    zoomDataLine: '#525252',
    zoomDataArea: '#262626',
    zoomSelectedLine: '#cb1557',
    zoomSelectedArea: '#9f1245',
    /** @brief Alternating lap band fills (with lapOpacity). */
    lapEven: '#360a31',
    lapOdd: '#ffffff',
    lapOpacity: 0.1
})

/**
 * @brief Light dashboard chart chrome.
 * @type {Readonly<ChartThemeTokens>}
 */
const lightTokens = Object.freeze({
    canvas: '#ffffff',
    axisLine: '#d4d4d8',
    axisLabel: '#52525b',
    grid: '#e4e4e7',
    tooltipBg: 'rgba(255, 255, 255, 0.96)',
    tooltipBorder: '#d4d4d8',
    tooltipText: '#18181b',
    tooltipUnit: '#71717a',
    markAreaLabel: '#52525b',
    zoomBorder: '#d4d4d8',
    zoomText: '#52525b',
    zoomHandle: '#cb1557',
    zoomDataLine: '#a1a1aa',
    zoomDataArea: '#f4f4f5',
    zoomSelectedLine: '#cb1557',
    zoomSelectedArea: '#f9a8d4',
    lapEven: '#cb1557',
    lapOdd: '#d4d4d8',
    lapOpacity: 0.12
})

/**
 * @brief Chart chrome token bundle consumed by ECharts option builders.
 * @typedef {Object} ChartThemeTokens
 * @property {string} canvas - Plot background suggestion (optional graphic)
 * @property {string} axisLine - Axis baseline stroke
 * @property {string} axisLabel - Tick label color
 * @property {string} grid - Split line color when grid enabled
 * @property {string} tooltipBg - Tooltip panel background
 * @property {string} tooltipBorder - Tooltip outline
 * @property {string} tooltipText - Primary tooltip text
 * @property {string} tooltipUnit - Secondary unit text in tooltip HTML
 * @property {string} markAreaLabel - Lap label text on graph
 * @property {string} zoomBorder - Master zoom slider border
 * @property {string} zoomText - Master zoom text
 * @property {string} zoomHandle - Slider handle fill
 * @property {string} zoomDataLine - Unselected rail line
 * @property {string} zoomDataArea - Unselected rail fill
 * @property {string} zoomSelectedLine - Selected range line
 * @property {string} zoomSelectedArea - Selected range fill
 * @property {string} lapEven - Lap band color (even lap numbers)
 * @property {string} lapOdd - Lap band color (odd lap numbers)
 * @property {number} lapOpacity - Band fill opacity (0–1)
 */

/**
 * @brief Resolve chart tokens for the active resolved theme.
 * @param {ChartThemeId} theme - Effective UI theme (`light` or `dark`)
 * @returns {Readonly<ChartThemeTokens>} Frozen token object for ECharts options
 */
export function getChartTokens(theme) {
    return theme === 'light' ? lightTokens : darkTokens
}

/**
 * @brief Metric line colors tuned per theme (same hues, adjusted lightness).
 * @param {ChartThemeId} theme - Effective UI theme
 * @returns {Readonly<Record<string, string>>} Map of telemetry key to hex color
 */
export function getMetricColorMap(theme) {
    if (theme === 'light') {
        return Object.freeze({
            speed: '#0d9488',
            rpm: '#d97706',
            current: '#dc2626',
            voltage: '#059669',
            throttle: '#2563eb',
            temp1: '#ea580c',
            temp2: '#c2410c',
            ampH: '#7c3aed',
            gear: '#4f46e5',
            brake: '#e11d48',
            voltageLower: '#047857',
            voltageHigh: '#065f46',
            voltageDiff: '#064e3b',
            tempDiff: '#9a3412'
        })
    }
    return Object.freeze({
        speed: '#2dd4bf',
        rpm: '#fbbf24',
        current: '#f87171',
        voltage: '#34d399',
        throttle: '#60a5fa',
        temp1: '#fb923c',
        temp2: '#f97316',
        ampH: '#a78bfa',
        gear: '#818cf8',
        brake: '#f43f5e',
        voltageLower: '#10b981',
        voltageHigh: '#059669',
        voltageDiff: '#047857',
        tempDiff: '#c2410c'
    })
}

/**
 * @brief Fallback palette when a metric key is unknown (deterministic pick elsewhere).
 * @param {ChartThemeId} theme - Effective UI theme
 * @returns {Readonly<string[]>} Ordered list of hex colors
 */
export function getFallbackMetricColors(theme) {
    if (theme === 'light') {
        return Object.freeze([
            '#0d9488', '#db2777', '#d97706', '#2563eb', '#7c3aed',
            '#059669', '#dc2626', '#4f46e5', '#ea580c'
        ])
    }
    return Object.freeze([
        '#2dd4bf', '#f472b6', '#fbbf24', '#60a5fa', '#a78bfa',
        '#34d399', '#f87171', '#818cf8', '#fb923c'
    ])
}

/**
 * @brief Server stats chart series colors (admin health tab).
 * @param {ChartThemeId} theme - Effective UI theme
 * @returns {Readonly<Record<string, string>>} Named stat keys to hex colors
 */
export function getServerStatsSeriesColors(theme) {
    if (theme === 'light') {
        return Object.freeze({
            cpuLoad: '#d97706',
            memoryUsage: '#4f46e5',
            bandwidthIn: '#2563eb',
            bandwidthOut: '#7c3aed',
            activeCars: '#059669',
            spectators: '#db2777',
            defaultAccent: '#7c3aed'
        })
    }
    return Object.freeze({
        cpuLoad: '#f59e0b',
        memoryUsage: '#6366f1',
        bandwidthIn: '#3b82f6',
        bandwidthOut: '#8b5cf6',
        activeCars: '#10b981',
        spectators: '#ec4899',
        defaultAccent: '#8b5cf6'
    })
}
