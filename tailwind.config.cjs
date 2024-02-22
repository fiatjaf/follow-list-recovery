/** @type {import('tailwindcss').Config}*/
const config = {
  content: ['index.html', './src/*.{ts,svelte}', './src/**/*.{ts,svelte}'],
  theme: {
    extend: {}
  }
}

module.exports = config
