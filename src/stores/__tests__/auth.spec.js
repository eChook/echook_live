import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '../auth'

// Mock the msgpack authApi
vi.mock('../../utils/msgpack', () => ({
    authApi: {
        post: vi.fn()
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
    })
})
