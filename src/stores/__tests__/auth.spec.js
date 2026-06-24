import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '../auth'

// Mock the msgpack authApi
vi.mock('../../utils/msgpack', () => ({
    api: {
        post: vi.fn(),
        get: vi.fn(),
        delete: vi.fn()
    },
    authApi: {
        post: vi.fn(),
        get: vi.fn()
    }
}))

import { api, authApi } from '../../utils/msgpack'

describe('auth store', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        vi.clearAllMocks()
        api.get.mockRejectedValue({ response: { status: 403, data: { error: 'Admin access required' } } })
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

        it('restores admin status when session belongs to an admin user', async () => {
            const auth = useAuthStore()
            auth.user = { id: 'u1', name: 'Admin Driver' }
            authApi.post.mockResolvedValue({ data: { id: 'u1' } })
            api.get.mockResolvedValue({ data: { uptime: 10 } })

            const result = await auth.checkSession()

            expect(result).toEqual({ success: true })
            expect(api.get).toHaveBeenCalledWith('/admin/stats', {
                params: { limit: 1 },
                withCredentials: true
            })
            expect(auth.isAdmin).toBe(true)
        })

        it('uses isAdmin when session payload includes role information', async () => {
            const auth = useAuthStore()
            auth.user = { id: 'u1', name: 'Admin Driver' }
            authApi.post.mockResolvedValue({ data: { id: 'u1', isAdmin: true } })

            const result = await auth.checkSession()

            expect(result).toEqual({ success: true })
            expect(api.get).not.toHaveBeenCalled()
            expect(auth.isAdmin).toBe(true)
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

    describe('deleteTelemetry', () => {
        it('returns success when server deletes telemetry', async () => {
            const auth = useAuthStore()
            api.post.mockResolvedValue({
                data: { success: true, message: 'Telemetry deleted', deleted: 1200 }
            })

            const result = await auth.deleteTelemetry('123456')

            expect(api.post).toHaveBeenCalledWith(
                '/account/delete-telemetry',
                { code: '123456', deleteAll: true },
                { withCredentials: true }
            )
            expect(result).toEqual({ success: true, message: 'Telemetry deleted', deleted: 1200 })
        })

        it('returns error when server rejects deletion', async () => {
            const auth = useAuthStore()
            api.post.mockRejectedValue({
                response: { data: { message: 'Invalid or expired verification code' } }
            })

            const result = await auth.deleteTelemetry('000000')

            expect(result).toEqual({ success: false, error: 'Invalid or expired verification code' })
        })

        it('returns a clear message when no telemetry rows were deleted', async () => {
            const auth = useAuthStore()
            api.post.mockResolvedValue({
                data: { success: true, message: 'All telemetry data deleted successfully.', deleted: 0 }
            })

            const result = await auth.deleteTelemetry('123456')

            expect(result).toEqual({
                success: false,
                error: 'No telemetry data was found for your account.'
            })
        })

        it('returns a clear message when the account is not found', async () => {
            const auth = useAuthStore()
            api.post.mockRejectedValue({
                response: { status: 404, data: { success: false, message: 'User not found' } }
            })

            const result = await auth.deleteTelemetry('123456')

            expect(result).toEqual({ success: false, error: 'User not found' })
        })
    })

    describe('deleteTelemetryRange', () => {
        it('returns success when server deletes telemetry in range', async () => {
            const auth = useAuthStore()
            api.post.mockResolvedValue({
                data: { success: true, message: 'Telemetry deleted', deleted: 48210 }
            })

            const result = await auth.deleteTelemetryRange('123456', '2026-01-01', '2026-01-31')

            expect(api.post).toHaveBeenCalledWith(
                '/account/delete-telemetry',
                { code: '123456', fromDate: '2026-01-01', toDate: '2026-01-31' },
                { withCredentials: true }
            )
            expect(result).toEqual({ success: true, message: 'Telemetry deleted', deleted: 48210 })
        })

        it('returns error when server rejects range deletion', async () => {
            const auth = useAuthStore()
            api.post.mockRejectedValue({
                response: { data: { message: 'Invalid range' } }
            })

            const result = await auth.deleteTelemetryRange('123456', '2026-01-31', '2026-01-01')

            expect(result).toEqual({ success: false, error: 'Invalid range' })
        })
    })

    describe('deleteAccount', () => {
        it('logs out and returns success when server deletes account', async () => {
            const auth = useAuthStore()
            auth.user = { id: 'u1', car: 'TestCar' }
            api.post.mockResolvedValue({
                data: { success: true, message: 'Account deleted' }
            })

            const result = await auth.deleteAccount('123456')

            expect(api.post).toHaveBeenCalledWith(
                '/account/delete',
                { code: '123456' },
                { withCredentials: true }
            )
            expect(result).toEqual({ success: true, message: 'Account deleted' })
            expect(auth.user).toBeNull()
        })

        it('returns error without logging out on failure', async () => {
            const auth = useAuthStore()
            auth.user = { id: 'u1', car: 'TestCar' }
            api.post.mockResolvedValue({ data: { success: false, message: 'Forbidden' } })

            const result = await auth.deleteAccount('000000')

            expect(result).toEqual({ success: false, error: 'Forbidden' })
            expect(auth.user).toEqual({ id: 'u1', car: 'TestCar' })
        })

        it('returns server error message from rejected delete request', async () => {
            const auth = useAuthStore()
            auth.user = { id: 'u1', car: 'TestCar' }
            api.post.mockRejectedValue({
                response: { status: 500, data: { success: false, message: 'Server error' } }
            })

            const result = await auth.deleteAccount('123456')

            expect(result).toEqual({ success: false, error: 'Server error' })
            expect(auth.user).toEqual({ id: 'u1', car: 'TestCar' })
        })

        it('returns a clear message when account deletion finds no account', async () => {
            const auth = useAuthStore()
            auth.user = { id: 'u1', car: 'TestCar' }
            api.post.mockRejectedValue({
                response: { status: 404, data: {} }
            })

            const result = await auth.deleteAccount('123456')

            expect(result).toEqual({
                success: false,
                error: 'No account was found for this session. It may have already been deleted.'
            })
            expect(auth.user).toEqual({ id: 'u1', car: 'TestCar' })
        })
    })
})
