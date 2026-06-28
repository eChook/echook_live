/**
 * @file utils/navTabClasses.js
 * @brief Shared Tailwind classes for standard sidebar and sub-nav tab buttons.
 * @description Unifies active/inactive styling across dashboard, settings, admin,
 *              and map metric pickers. Analytics tab uses its own distinct patterns.
 */

/** @brief Left accent bar shown on active vertical sidebar tabs. */
export const NAV_TAB_LEFT_ACCENT_CLASS = 'absolute left-0 w-1 h-6 bg-primary rounded-r-full'

/** @brief Base layout classes applied to every nav tab button. */
export const NAV_TAB_BUTTON_BASE =
  'relative flex items-center transition whitespace-nowrap'

/**
 * @brief Active/inactive class string for a standard nav tab button.
 * @param {boolean} isActive - Whether this tab is currently selected
 * @returns {string} Tailwind class string
 */
export function navTabButtonClass(isActive) {
  return [
    NAV_TAB_BUTTON_BASE,
    isActive
      ? 'bg-primary/10 text-primary'
      : 'text-zinc-500 dark:text-gray-500 hover:bg-zinc-200 dark:hover:bg-neutral-800 hover:text-zinc-800 dark:hover:text-gray-300'
  ].join(' ')
}

/**
 * @brief Active/inactive classes for compact icon-only dashboard sidebar tabs.
 * @param {boolean} isActive - Whether this tab is currently selected
 * @returns {string} Tailwind class string
 */
export function navTabIconButtonClass(isActive) {
  return [
    'w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200 group relative',
    isActive
      ? 'bg-primary/10 text-primary'
      : 'text-zinc-500 dark:text-gray-500 hover:bg-zinc-200 dark:hover:bg-neutral-800 hover:text-zinc-800 dark:hover:text-gray-300'
  ].join(' ')
}

/**
 * @brief Active/inactive classes for list-row selection (e.g. admin map tracks).
 * @param {boolean} isActive - Whether this row is currently selected
 * @returns {string} Tailwind class string
 */
export function navTabListRowClass(isActive) {
  return isActive
    ? 'bg-primary/10 border-primary'
    : 'bg-zinc-50 dark:bg-neutral-900 border-zinc-200 dark:border-neutral-700 hover:border-zinc-400 dark:hover:border-gray-500'
}

/**
 * @brief Active/inactive classes for map metric picker items.
 * @param {boolean} isActive - Whether this metric is selected
 * @returns {string} Tailwind class string
 */
export function navTabMetricPickerClass(isActive) {
  return isActive
    ? 'bg-primary/10 text-primary border border-transparent'
    : 'text-zinc-600 dark:text-gray-400 hover:bg-zinc-100 dark:hover:bg-neutral-800 hover:text-zinc-900 dark:hover:text-white border border-transparent'
}
