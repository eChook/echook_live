import { describe, it, expect } from 'vitest'
import { renderPolicyMarkdown } from '../policyMarkdown'

describe('renderPolicyMarkdown', () => {
    it('renders headings and paragraphs', () => {
        const html = renderPolicyMarkdown('# Title\n\nHello **world**.')
        expect(html).toContain('<h1')
        expect(html).toContain('Title')
        expect(html).toContain('<strong>world</strong>')
    })

    it('renders markdown links', () => {
        const html = renderPolicyMarkdown('[Privacy](/#/privacy)')
        expect(html).toContain('href="/#/privacy"')
        expect(html).toContain('Privacy')
    })

    it('renders https and mailto links used in policy documents', () => {
        const html = renderPolicyMarkdown(
            '[live](https://live.echook.uk) and [email](mailto:info@echook.uk)'
        )
        expect(html).toContain('href="https://live.echook.uk"')
        expect(html).toContain('href="mailto:info@echook.uk"')
    })

    it('does not render javascript or other unsafe link protocols', () => {
        const html = renderPolicyMarkdown('[click me](javascript:alert(1))')
        expect(html).not.toContain('<a ')
        expect(html).not.toContain('javascript:')
        expect(html).toContain('click me')
    })

    it('does not render protocol-relative external links', () => {
        const html = renderPolicyMarkdown('[evil](//evil.example/phish)')
        expect(html).not.toContain('<a ')
        expect(html).toContain('evil')
    })

    it('renders tables', () => {
        const md = '| Col | Val |\n| --- | --- |\n| A | 1 |'
        const html = renderPolicyMarkdown(md)
        expect(html).toContain('<table')
        expect(html).toContain('Col')
        expect(html).toContain('1')
    })
})
