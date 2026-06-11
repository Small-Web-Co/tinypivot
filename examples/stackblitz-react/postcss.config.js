import postcssImport from 'postcss-import'

// Resolves the `@import './themes.css'` in tinypivot-react@1.0.81 style.css
// (see fixMissingThemes in vite.config.js).
// TODO: remove once a version newer than 1.0.81 ships dist/themes.css.
export default {
  plugins: [postcssImport()],
}
