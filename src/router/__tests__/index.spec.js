import { describe, it, expect, beforeEach, vi } from 'vitest'
import { runAuthGuard, resetSessionCheckState } from '../index'

/** @brief Policy and legal routes must stay public (no auth redirect). */
const PUBLIC_POLICY_ROUTES = [
    { name: 'policy', meta: {}, params: { slug: 'privacy' } },
    { path: '/privacy', meta: {} },
    { path: '/terms', meta: {} },
    { path: '/data-management', meta: {} }
]

describe('router auth guard', () => {
    beforeEach(() => {
        resetSessionCheckState()
    })

    it('allows protected navigation on transient session-check failure', async () => {
        const next = vi.fn()
        const authStore = {
            isAuthenticated: true,
            checkSession: vi.fn().mockResolvedValue({ success: false, transient: true })
        }

        await runAuthGuard({ meta: { requiresAuth: true } }, {}, next, authStore)

        expect(authStore.checkSession).toHaveBeenCalledTimes(1)
        expect(next).toHaveBeenCalledWith()
    })

    it('redirects to login when session check confirms auth failure', async () => {
        const next = vi.fn()
        const authStore = {
            isAuthenticated: true,
            checkSession: vi.fn().mockImplementation(async () => {
                authStore.isAuthenticated = false
                return { success: false, error: 'Session expired' }
            })
        }

        await runAuthGuard({ meta: { requiresAuth: true } }, {}, next, authStore)

        expect(next).toHaveBeenCalledWith({ name: 'login' })
    })

    it('checks session once after successful validation', async () => {
        const next = vi.fn()
        const authStore = {
            isAuthenticated: true,
            checkSession: vi.fn().mockResolvedValue({ success: true })
        }

        await runAuthGuard({ meta: { requiresAuth: false } }, {}, next, authStore)
        await runAuthGuard({ meta: { requiresAuth: false } }, {}, next, authStore)

        expect(authStore.checkSession).toHaveBeenCalledTimes(1)
    })

    it.each(PUBLIC_POLICY_ROUTES)('allows public policy navigation without login (%#)', async (route) => {
        const next = vi.fn()
        const authStore = {
            isAuthenticated: false,
            checkSession: vi.fn()
        }

        await runAuthGuard(route, {}, next, authStore)

        expect(next).toHaveBeenCalledWith()
        expect(next).not.toHaveBeenCalledWith({ name: 'login' })
    })
})
