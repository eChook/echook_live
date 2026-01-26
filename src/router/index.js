import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

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

router.beforeEach((to, from, next) => {
    const authStore = useAuthStore()
    if (to.meta.requiresAuth && !authStore.isAuthenticated) {
        next({ name: 'login' })
    } else {
        next()
    }
})

export default router
