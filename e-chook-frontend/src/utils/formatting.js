export const getUnit = (key) => {
    const k = key.toLowerCase()
    if (k.includes('rpm')) return 'RPM'
    if (k.includes('gear')) return ''
    if (k.includes('lap')) return ''
    if (k.includes('speed')) return 'mph'
    if (k.includes('volt') || k.includes('batt') || k === 'v') return 'V'
    if (k.includes('amph')) return 'Ah'
    if (k.includes('curr') || k.includes('amp')) return 'A'
    if (k.includes('temp')) return '°C'
    if (k.includes('throttle') || k.includes('soc')) return '%'
    if (k.includes('press')) return 'psi'
    return ''
}

export const formatValue = (key, value) => {
    if (value === null || value === undefined) return '-'
    if (typeof value !== 'number') return value

    const k = key.toLowerCase()

    // Integers
    if (k.includes('rpm') || k.includes('gear') || k.includes('lap')) {
        return value.toFixed(0)
    }

    // Time
    if (k === 'updated' || k === 'timestamp' || k.includes('time')) {
        return new Date(value).toLocaleTimeString()
    }

    // GPS
    if (k === 'lat' || k === 'lon' || k.includes('gps')) {
        return value.toFixed(5)
    }

    // Default 2 decimal places
    return value.toFixed(2)
}
