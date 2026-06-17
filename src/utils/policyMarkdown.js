/**
 * @file utils/policyMarkdown.js
 * @brief Lightweight markdown-to-HTML renderer for legal policy pages.
 * @description Converts a constrained subset of markdown used in docs/legal/*.md
 *              without adding a third-party markdown dependency.
 */

/**
 * @brief Escape HTML special characters in plain text.
 * @param {string} text - Raw text segment
 * @returns {string} HTML-safe text
 */
function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

/**
 * @brief True when a markdown link destination is safe for anchor href attributes.
 * @description Allows same-origin relative paths, in-page hash anchors, https/http, and mailto.
 *              Rejects executable schemes (javascript:, data:, etc.) and protocol-relative URLs.
 * @param {string} href - Raw markdown link destination
 * @returns {boolean} True when the URL may be rendered as a link
 */
function isSafePolicyHref(href) {
    const trimmed = String(href || '').trim()
    if (!trimmed) return false

    if (trimmed.startsWith('//')) {
        return false
    }

    // App routes such as /#/privacy.
    if (trimmed.startsWith('/')) {
        return true
    }
    if (trimmed.startsWith('#')) {
        return true
    }

    try {
        const parsed = new URL(trimmed, 'https://policy.invalid')
        const protocol = parsed.protocol.toLowerCase()
        return protocol === 'https:' || protocol === 'http:' || protocol === 'mailto:'
    } catch {
        return false
    }
}

/**
 * @brief Apply inline markdown formatting (links, bold, inline code).
 * @param {string} text - Single line or paragraph fragment
 * @returns {string} HTML with inline formatting applied
 */
function formatInline(text) {
    let html = escapeHtml(text)
    // Markdown links: [label](url) — drop the anchor when the destination is not a safe protocol.
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, href) => {
        if (!isSafePolicyHref(href)) {
            return label
        }
        return `<a href="${href.trim()}" class="text-primary hover:underline">${label}</a>`
    })
    // Bold: **text**
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Inline code: `text`
    html = html.replace(/`([^`]+)`/g, '<code class="text-sm bg-zinc-100 dark:bg-neutral-800 px-1 rounded">$1</code>')
    return html
}

/**
 * @brief Convert policy markdown to HTML for display in PolicyView.
 * @description Supports headings, paragraphs, blockquotes, tables, ordered/unordered lists,
 *              horizontal rules, and inline formatting used in legal documents.
 * @param {string} markdown - Raw markdown source
 * @returns {string} HTML string safe for v-html (user-authored legal docs only)
 */
export function renderPolicyMarkdown(markdown) {
    const lines = markdown.replace(/\r\n/g, '\n').split('\n')
    const htmlParts = []
    let index = 0

    while (index < lines.length) {
        const line = lines[index]

        // Skip empty lines
        if (line.trim() === '') {
            index += 1
            continue
        }

        // Horizontal rule
        if (/^---+$/.test(line.trim())) {
            htmlParts.push('<hr class="my-8 border-zinc-200 dark:border-neutral-700" />')
            index += 1
            continue
        }

        // Headings
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
        if (headingMatch) {
            const level = headingMatch[1].length
            const tag = `h${Math.min(level, 6)}`
            const sizeClass = {
                1: 'text-3xl font-bold mt-0 mb-6',
                2: 'text-2xl font-bold mt-10 mb-4',
                3: 'text-xl font-semibold mt-8 mb-3',
                4: 'text-lg font-semibold mt-6 mb-2',
                5: 'text-base font-semibold mt-4 mb-2',
                6: 'text-sm font-semibold mt-4 mb-2'
            }[level] || 'text-base font-semibold mt-4 mb-2'
            htmlParts.push(`<${tag} class="${sizeClass} text-zinc-900 dark:text-white">${formatInline(headingMatch[2])}</${tag}>`)
            index += 1
            continue
        }

        // Blockquote
        if (line.startsWith('> ')) {
            const quoteLines = []
            while (index < lines.length && lines[index].startsWith('> ')) {
                quoteLines.push(lines[index].slice(2))
                index += 1
            }
            htmlParts.push(
                `<blockquote class="border-l-4 border-primary/50 pl-4 my-4 text-zinc-600 dark:text-gray-400 italic">${formatInline(quoteLines.join(' '))}</blockquote>`
            )
            continue
        }

        // Table
        if (line.includes('|') && index + 1 < lines.length && /^\|?[\s\-:|]+\|/.test(lines[index + 1])) {
            const tableLines = []
            while (index < lines.length && lines[index].includes('|')) {
                tableLines.push(lines[index])
                index += 1
            }
            const headerCells = tableLines[0].split('|').map((cell) => cell.trim()).filter(Boolean)
            const bodyRows = tableLines.slice(2).map((row) =>
                row.split('|').map((cell) => cell.trim()).filter(Boolean)
            )
            let tableHtml = '<div class="overflow-x-auto my-4"><table class="min-w-full text-sm border border-zinc-200 dark:border-neutral-700"><thead class="bg-zinc-50 dark:bg-neutral-800"><tr>'
            headerCells.forEach((cell) => {
                tableHtml += `<th class="px-3 py-2 text-left font-semibold border-b border-zinc-200 dark:border-neutral-700">${formatInline(cell)}</th>`
            })
            tableHtml += '</tr></thead><tbody>'
            bodyRows.forEach((row) => {
                tableHtml += '<tr class="border-b border-zinc-100 dark:border-neutral-800">'
                row.forEach((cell) => {
                    tableHtml += `<td class="px-3 py-2 align-top">${formatInline(cell)}</td>`
                })
                tableHtml += '</tr>'
            })
            tableHtml += '</tbody></table></div>'
            htmlParts.push(tableHtml)
            continue
        }

        // Unordered list
        if (/^[-*]\s+/.test(line)) {
            htmlParts.push('<ul class="list-disc pl-6 my-4 space-y-2 text-zinc-700 dark:text-gray-300">')
            while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
                htmlParts.push(`<li>${formatInline(lines[index].replace(/^[-*]\s+/, ''))}</li>`)
                index += 1
            }
            htmlParts.push('</ul>')
            continue
        }

        // Ordered list
        if (/^\d+\.\s+/.test(line)) {
            htmlParts.push('<ol class="list-decimal pl-6 my-4 space-y-2 text-zinc-700 dark:text-gray-300">')
            while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
                htmlParts.push(`<li>${formatInline(lines[index].replace(/^\d+\.\s+/, ''))}</li>`)
                index += 1
            }
            htmlParts.push('</ol>')
            continue
        }

        // Paragraph (collect consecutive non-special lines)
        const paragraphLines = []
        while (
            index < lines.length &&
            lines[index].trim() !== '' &&
            !lines[index].startsWith('#') &&
            !lines[index].startsWith('> ') &&
            !/^---+$/.test(lines[index].trim()) &&
            !/^[-*]\s+/.test(lines[index]) &&
            !/^\d+\.\s+/.test(lines[index]) &&
            !(lines[index].includes('|') && index + 1 < lines.length && /^\|?[\s\-:|]+\|/.test(lines[index + 1]))
        ) {
            paragraphLines.push(lines[index])
            index += 1
        }
        htmlParts.push(`<p class="my-3 text-zinc-700 dark:text-gray-300 leading-relaxed">${formatInline(paragraphLines.join(' '))}</p>`)
    }

    return htmlParts.join('\n')
}

/**
 * @brief Policy document registry keyed by route slug.
 */
export const POLICY_DOCUMENTS = {
    privacy: {
        slug: 'privacy',
        title: 'Privacy Policy',
        source: () => import('../../docs/legal/privacy-policy.md?raw').then((m) => m.default)
    },
    'data-management': {
        slug: 'data-management',
        title: 'Data Management Policy',
        source: () => import('../../docs/legal/data-management-policy.md?raw').then((m) => m.default)
    },
    terms: {
        slug: 'terms',
        title: 'Terms of Service',
        source: () => import('../../docs/legal/terms-of-service.md?raw').then((m) => m.default)
    }
}

/**
 * @brief Resolve policy metadata by route slug.
 * @param {string} slug - Route param slug
 * @returns {{ slug: string, title: string, source: Function }|null}
 */
export function getPolicyDocument(slug) {
    return POLICY_DOCUMENTS[slug] || null
}
