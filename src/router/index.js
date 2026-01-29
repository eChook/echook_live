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
router.beforeEach((to, from, next) => {
    const authStore = useAuthStore()
    if (to.meta.requiresAuth && !authStore.isAuthenticated) {
        next({ name: 'login' })
    } else {
        next()
    }
})

export default router
