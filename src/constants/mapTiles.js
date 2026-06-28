/**
 * @file constants/mapTiles.js
 * @brief Leaflet tile layer URLs for light and dark UI themes.
 */

/** @brief OpenStreetMap (light) and Carto dark basemap URLs. */
export const MAP_TILE_URLS = {
    light: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
}

/**
 * @brief Resolve tile URL for the active resolved theme.
 * @param {'light'|'dark'} theme - Effective UI theme from settings store
 * @returns {string} Leaflet tile layer URL template
 */
export function getMapTileUrl(theme) {
    return theme === 'dark' ? MAP_TILE_URLS.dark : MAP_TILE_URLS.light
}
