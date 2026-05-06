import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '../auth'

// Mock the msgpack authApi
vi.mock('../../utils/msgpack', () => ({
    api: {
        post: vi.fn()
    },
    authApi: {
        post: vi.fn(),
        get: vi.fn()
    }
}))

import { authApi } from '../../utils/msgpack'

describe('auth store', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        vi.clearAllMocks()
    })

    describe('initial state', () => {
        it('starts with null user', () => {
            const auth = useAuthStore()
            expect(auth.user).toBeNull()
        })

        it('isAuthenticated is false when no user', () => {
            const auth = useAuthStore()
            expect(auth.isAuthenticated).toBe(false)
        })
    })

    describe('login', () => {
        it('sets user on successful login', async () => {
            const auth = useAuthStore()
            const mockUser = { id: '123', name: 'Test Car', email: 'test@example.com' }

            authApi.post.mockResolvedValue({
                data: { success: true, user: mockUser }
            })

            const result = await auth.login({ email: 'test@example.com', password: 'password' })

            expect(result.success).toBe(true)
            expect(auth.user).toEqual(mockUser)
            expect(auth.isAuthenticated).toBe(true)
        })

        it('returns structured failure for non-throwing unsuccessful login', async () => {
            const auth = useAuthStore()
            authApi.post.mockResolvedValue({
                data: { success: false, message: 'Invalid credentials' }
            })

            const result = await auth.login({ email: 'test@example.com', password: 'wrong' })
            expect(result).toEqual({ success: false, error: 'Invalid credentials' })
        })

        it('returns error on failed login', async () => {
            const auth = useAuthStore()

            authApi.post.mockRejectedValue({
                response: { data: { message: 'Invalid credentials' } }
            })

            const result = await auth.login({ email: 'test@example.com', password: 'wrong' })

            expect(result.success).toBe(false)
            expect(result.error).toBe('Invalid credentials')
            expect(auth.user).toBeNull()
        })
    })

    describe('logout', () => {
        it('clears user on logout', () => {
            const auth = useAuthStore()
            auth.user = { id: '123', name: 'Test' }

            auth.logout()

            expect(auth.user).toBeNull()
            expect(auth.isAuthenticated).toBe(false)
        })
    })

    describe('register', () => {
        it('sets user if returned on successful registration', async () => {
            const auth = useAuthStore()
            const mockUser = { id: '456', name: 'New Car' }

            authApi.post.mockResolvedValue({
                data: { success: true, user: mockUser }
            })

            const result = await auth.register({ name: 'New Car', email: 'new@example.com', password: 'password' })

            expect(result.success).toBe(true)
            expect(auth.user).toEqual(mockUser)
        })

        it('returns structured failure for non-throwing unsuccessful register', async () => {
            const auth = useAuthStore()
            authApi.post.mockResolvedValue({
                data: { success: false, message: 'Already exists' }
            })

            const result = await auth.register({ name: 'New Car', email: 'new@example.com', password: 'password' })
            expect(result).toEqual({ success: false, error: 'Already exists' })
        })
    })

    describe('startDemo', () => {
        it('sets demo user on successful demo start', async () => {
            const auth = useAuthStore()
            const mockDemoUser = { id: 'demo-car-1', car: 'Demo Car', team: 'Demo Team', isDemo: true }

            authApi.get.mockResolvedValue({
                data: { success: true, user: mockDemoUser }
            })

            const result = await auth.startDemo()

            expect(result.success).toBe(true)
            expect(auth.user).toEqual(mockDemoUser)
            expect(auth.isAuthenticated).toBe(true)
        })

        it('returns error when demo fails', async () => {
            const auth = useAuthStore()

            authApi.get.mockRejectedValue({
                response: { data: { message: 'Demo unavailable' } }
            })

            const result = await auth.startDemo()

            expect(result.success).toBe(false)
            expect(result.error).toBe('Demo unavailable')
            expect(auth.user).toBeNull()
        })
    })

    describe('checkSession', () => {
        it('returns success for valid session payload', async () => {
            const auth = useAuthStore()
            auth.user = { id: 'u1', name: 'Driver 1' }
            authApi.post.mockResolvedValue({ data: { id: 'u1' } })

            const result = await auth.checkSession()

            expect(result).toEqual({ success: true })
            expect(auth.user).toEqual({ id: 'u1', name: 'Driver 1' })
        })

        it('logs out when session payload has no id', async () => {
            const auth = useAuthStore()
            auth.user = { id: 'u1', name: 'Driver 1' }
            authApi.post.mockResolvedValue({ data: {} })

            const result = await auth.checkSession()

            expect(result).toEqual({ success: false, error: 'Session expired' })
            expect(auth.user).toBeNull()
        })

        it('logs out on auth status failure', async () => {
            const auth = useAuthStore()
            auth.user = { id: 'u1', name: 'Driver 1' }
            authApi.post.mockRejectedValue({
                response: { status: 401, data: { message: 'Unauthorized' } }
            })

            const result = await auth.checkSession()

            expect(result).toEqual({ success: false, error: 'Unauthorized' })
            expect(auth.user).toBeNull()
        })

        it('keeps local session on transient network failure', async () => {
            const auth = useAuthStore()
            auth.user = { id: 'u1', name: 'Driver 1' }
            authApi.post.mockRejectedValue(new Error('Network down'))

            const result = await auth.checkSession()

            expect(result).toEqual({ success: false, transient: true, error: 'Session check failed' })
            expect(auth.user).toEqual({ id: 'u1', name: 'Driver 1' })
        })
    })
})
