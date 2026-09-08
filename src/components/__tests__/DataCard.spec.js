import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DataCard from '../DataCard.vue'

describe('DataCard', () => {
    const mountCard = (props = {}) => {
        return mount(DataCard, {
            props: {
                label: 'Voltage',
                value: 24.5,
                unit: 'V',
                stale: false,
                tooltip: 'Battery voltage',
                ...props
            }
        })
    }

    it('renders label correctly', () => {
        const wrapper = mountCard({ label: 'Current' })

        expect(wrapper.text()).toContain('Current')
    })

    it('renders value with formatting', () => {
        const wrapper = mountCard({ label: 'Voltage', value: 24.567 })

        expect(wrapper.text()).toContain('24.57')
    })

    it('renders unit when provided', () => {
        const wrapper = mountCard({ unit: 'V' })

        expect(wrapper.text()).toContain('(V)')
    })

    it('renders - for null value', () => {
        const wrapper = mountCard({ value: null })

        expect(wrapper.text()).toContain('-')
    })

    it('renders - for undefined value', () => {
        const wrapper = mountCard({ value: undefined })

        expect(wrapper.text()).toContain('-')
    })

    it('applies stale styling when stale is true', () => {
        const wrapper = mountCard({ stale: true })

        expect(wrapper.classes()).toContain('opacity-50')
        expect(wrapper.classes()).toContain('grayscale')
    })

    it('does not apply stale styling when stale is false', () => {
        const wrapper = mountCard({ stale: false })

        expect(wrapper.classes()).toContain('opacity-100')
        expect(wrapper.classes()).not.toContain('grayscale')
    })

    it('sets title attribute for tooltip', () => {
        const wrapper = mountCard({ tooltip: 'Test tooltip text' })

        expect(wrapper.attributes('title')).toBe('Test tooltip text')
    })

    it('has cursor-grab class for drag indicator', () => {
        const wrapper = mountCard()

        expect(wrapper.classes()).toContain('cursor-grab')
    })

    describe('range strip', () => {
        const stripSelector = '.rounded-\\[3px\\].bg-zinc-100'

        it('renders the strip when rangeMin/rangeMax are provided', () => {
            const wrapper = mountCard({ value: 23, rangeMin: 20, rangeMax: 26 })

            expect(wrapper.find(stripSelector).exists()).toBe(true)
        })

        it('omits the strip when range data is missing', () => {
            const wrapper = mountCard()

            expect(wrapper.find(stripSelector).exists()).toBe(false)
        })

        it('does not render a strip for compact cards even with range data', () => {
            const wrapper = mountCard({ compact: true, rangeMin: 20, rangeMax: 26 })

            expect(wrapper.find(stripSelector).exists()).toBe(false)
        })
    })

    describe('compact variant', () => {
        it('renders a row layout without a range strip', () => {
            const wrapper = mountCard({ compact: true, label: 'Throttle', value: 62 })

            expect(wrapper.classes()).toContain('justify-between')
            expect(wrapper.text()).toContain('Throttle')
            expect(wrapper.text()).toContain('62')
        })
    })
})
