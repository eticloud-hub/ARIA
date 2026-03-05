/** @type {import('tailwindcss').Config} */
export default {
    content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
    theme: {
        extend: {
            colors: {
                navy: {
                    50: '#E8EDF3',
                    100: '#C5D1E0',
                    200: '#9EB3CA',
                    300: '#7795B4',
                    400: '#547EA3',
                    500: '#316792',
                    600: '#1E4F78',
                    700: '#143A5D',
                    800: '#0F2744',
                    900: '#081829',
                },
                forensic: {
                    amber: '#F59E0B',
                    'amber-light': '#FEF3C7',
                    green: '#10B981',
                    'green-light': '#D1FAE5',
                    red: '#EF4444',
                    'red-light': '#FEE2E2',
                    blue: '#3B82F6',
                    'blue-light': '#DBEAFE',
                },
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
                mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
            },
            animation: {
                'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'fade-in': 'fadeIn 0.3s ease-in-out',
                'slide-up': 'slideUp 0.3s ease-out',
                'gauge-fill': 'gaugeFill 1.5s ease-out forwards',
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                slideUp: {
                    '0%': { opacity: '0', transform: 'translateY(10px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                gaugeFill: {
                    '0%': { strokeDashoffset: '283' },
                    '100%': { strokeDashoffset: 'var(--gauge-offset)' },
                },
            },
        },
    },
    plugins: [],
};
