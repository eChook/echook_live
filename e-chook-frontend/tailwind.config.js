/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{vue,js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: '#cb1557',
            },
            fontFamily: {
                oswald: ['Oswald', 'sans-serif'],
            }
        },
    },
    plugins: [],
}
