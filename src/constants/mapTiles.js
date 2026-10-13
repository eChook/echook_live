/**
 * @file constants/mapTiles.js
 * @brief Leaflet tile layer URL for the app's maps.
 * @description Dark mode is handled with a CSS filter on the tile pane
 *              (see .leaflet-tile-pane rules in style.css) rather than a
 *              second tile source, since CARTO's free dark basemap tiles
 *              now require an API key.
 */

/** @brief OpenStreetMap tile URL template, used for both light and dark UI themes. */
export const MAP_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
