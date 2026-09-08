/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class',
    content: [
        "./index.html",
        "./src/**/*.{vue,js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: '#cb1557',
                'app-inset': 'var(--app-inset)',
                'app-hairline': 'var(--app-hairline)',
            },
            fontFamily: {
                oswald: ['Oswald', 'sans-serif'],
            }
        },
    },
    plugins: [],
}
