/**
 * @file composables/useTheme.js
 * @brief Applies resolved light/dark theme to the document root.
 * @description Watches the settings store for `themeMode` and `resolvedTheme`,
 *              toggles the `dark` class on `<html>`, sets `color-scheme`, and
 *              keeps `prefers-color-scheme` in sync when mode is `system`.
 */

import { watch } from 'vue'
import { useSettingsStore } from '../stores/settings'

/** @brief Media query for OS dark preference. */
const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)'

/**
 * @brief Apply resolved theme to `document.documentElement`.
 * @param {'light'|'dark'} resolved - Effective theme from settings store
 */
function applyDocumentTheme(resolved) {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    const isDark = resolved === 'dark'
    root.classList.toggle('dark', isDark)
    // Hint native scrollbars, form controls, etc.
    root.style.colorScheme = isDark ? 'dark' : 'light'
}

/**
 * @brief Subscribe to settings + system preference; apply theme and cleanup.
 * @description Call once after Pinia is installed (e.g. from `main.js`).
 * @returns {() => void} Teardown function (tests / HMR)
 */
export function setupThemeApplication() {
    const settings = useSettingsStore()

    let mediaQuery = null
    /** @type {((e: MediaQueryListEvent) => void) | null} */
    let onMediaChange = null

    const attachMediaListener = () => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
        mediaQuery = window.matchMedia(DARK_MEDIA_QUERY)
        settings.syncSystemPrefersDark(mediaQuery.matches)
        onMediaChange = (e) => {
            settings.syncSystemPrefersDark(e.matches)
        }
        mediaQuery.addEventListener('change', onMediaChange)
    }

    const detachMediaListener = () => {
        if (mediaQuery && onMediaChange) {
            mediaQuery.removeEventListener('change', onMediaChange)
        }
        mediaQuery = null
        onMediaChange = null
    }

    attachMediaListener()

    const stop = watch(
        () => settings.resolvedTheme,
        (resolved) => {
            applyDocumentTheme(resolved)
        },
        { immediate: true }
    )

    return () => {
        stop()
        detachMediaListener()
    }
}
