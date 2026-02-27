/** @type {import('tailwindcss').Config} */
const withOpacityValue = (variable) => {
  return ({ opacityValue }) => {
    if (opacityValue === undefined) {
      return `rgb(var(${variable}))`;
    }
    return `rgb(var(${variable}) / ${opacityValue})`;
  };
};

const config = {
  content: [
    './app/**/*.{js,jsx,ts,tsx,mdx}',
    './lib/**/*.{js,jsx,ts,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'aa-dark-blue': withOpacityValue('--aa-dark-blue'),
        'aa-orange': withOpacityValue('--aa-orange'),
        'aa-light-bg': withOpacityValue('--aa-light-bg'),
        'aa-white': withOpacityValue('--aa-white'),
        'aa-text-dark': withOpacityValue('--aa-text-dark'),
        'aa-gray': withOpacityValue('--aa-gray'),
      },
    },
  },
  plugins: [],
}

export default config
