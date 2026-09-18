/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    // Compiles the styles collected from source files into the `@stylex`
    // directive in app/globals.css. Reads plugin options from babel.config.json.
    "@stylexjs/postcss-plugin": {
      include: ["app/**/*.{ts,tsx}"],
      useCSSLayers: true,
    },
    autoprefixer: {},
  },
};

export default config;
