/**
 * @file router/index.js
 * @brief Vue Router configuration.
 * @description Defines application routes and navigation guards.
 *              Uses hash-based routing for GitHub Pages compatibility.
 *              Implements authentication guard for protected routes.
 */

import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

/**
 * @brief Vue Router instance with route definitions.
 * @description Routes:
 *              - `/` - Dashboard (requires authentication)
 *              - `/login` - Login page
 *              - `/register` - Registration page
 *              - `/spectate/:trackName` - Public spectator view
 * 
 *              All view components are lazy-loaded for code splitting.
 */
const router = createRouter({
    history: createWebHashHistory(import.meta.env.BASE_URL),
    routes: [
        {
            path: '/',
            name: 'dashboard',
            component: () => import('../views/DashboardView.vue'),
            meta: { requiresAuth: true }
        },
        {
            path: '/login',
            name: 'login',
            component: () => import('../views/LoginView.vue')
        },
        {
            path: '/register',
            name: 'register',
            component: () => import('../views/RegisterView.vue')
        },
        {
            path: '/spectate/:trackName',
            name: 'spectate',
            component: () => import('../views/SpectatorView.vue')
        }
    ]
})

/**
 * @brief Navigation guard for authentication.
 * @description Checks if route requires authentication and redirects
 *              unauthenticated users to the login page.
 * 
 * @param {Object} to - Target route object
 * @param {Object} from - Current route object  
 * @param {Function} next - Navigation callback
 */
let sessionChecked = false

/**
 * @brief Reset internal session-check flag.
 * @description Exposed for focused guard tests to isolate per-test state.
 */
export function resetSessionCheckState() {
    sessionChecked = false
}

/**
 * @brief Execute authentication guard logic for navigation.
 * @param {Object} to - Target route
 * @param {Object} from - Source route
 * @param {Function} next - Navigation continuation callback
 * @param {Object} [authStore=useAuthStore()] - Auth store instance override (tests)
 * @returns {Promise<void>}
 */
export async function runAuthGuard(to, from, next, authStore = useAuthStore()) {
    if (!sessionChecked && authStore.isAuthenticated) {
        const result = await authStore.checkSession()
        if (result?.success) {
            sessionChecked = true
        } else if (!result?.transient) {
            sessionChecked = true
        }
    }

    if (to.meta.requiresAuth && !authStore.isAuthenticated) {
        next({ name: 'login' })
    } else {
        next()
    }
}

router.beforeEach(async (to, from, next) => {
    await runAuthGuard(to, from, next)
})

export default router
