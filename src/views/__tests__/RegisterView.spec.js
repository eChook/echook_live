import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import RegisterView from '../RegisterView.vue'

const mockRegister = vi.fn()

vi.mock('../../stores/auth', () => ({
    useAuthStore: () => ({
        register: mockRegister,
        isAuthenticated: false
    })
}))

const routerPush = vi.fn()

vi.mock('vue-router', async () => {
    const actual = await vi.importActual('vue-router')
    return {
        ...actual,
        useRouter: () => ({ push: routerPush })
    }
})

describe('RegisterView policy acceptance', () => {
    beforeEach(() => {
        mockRegister.mockReset()
        routerPush.mockReset()
        mockRegister.mockResolvedValue({ success: true })
    })

    const mountView = () => mount(RegisterView, {
        global: {
            plugins: [createPinia()],
            stubs: {
                PublicHeader: true,
                PublicFooter: true,
                RouterLink: { template: '<a><slot /></a>' }
            }
        }
    })

    it('does not register when policies are not accepted', async () => {
        const wrapper = mountView()

        await wrapper.find('input[type="email"]').setValue('team@example.com')
        await wrapper.find('form').trigger('submit.prevent')
        await flushPromises()

        expect(mockRegister).not.toHaveBeenCalled()
        expect(wrapper.text()).toContain('You must accept the Terms of Service')
    })

    it('registers when policies are accepted', async () => {
        const wrapper = mountView()

        await wrapper.find('input[type="checkbox"]').setValue(true)
        await wrapper.find('input[type="email"]').setValue('team@example.com')
        await wrapper.find('form').trigger('submit.prevent')
        await flushPromises()

        expect(mockRegister).toHaveBeenCalled()
    })
})
