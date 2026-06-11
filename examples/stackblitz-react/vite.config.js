import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// tinypivot-react@1.0.81 style.css starts with `@import './themes.css'` but
// themes.css was accidentally omitted from the npm dist, so the import fails to
// resolve and the 20 brand themes are unavailable in that version. This plugin
// creates an empty placeholder so the build succeeds; the base light/dark themes
// used by this example live in style.css and are unaffected.
// TODO: remove this plugin (and postcss.config.js) once a version newer than
// 1.0.81 ships dist/themes.css.
function fixMissingThemes() {
  return {
    name: 'tinypivot-fix-missing-themes',
    buildStart() {
      const pkgDist = join(
        process.cwd(),
        'node_modules/@smallwebco/tinypivot-react/dist',
      )
      const themesDest = join(pkgDist, 'themes.css')
      if (!existsSync(themesDest)) {
        writeFileSync(themesDest, '/* placeholder: themes.css missing from 1.0.81 npm dist */\n', 'utf-8')
      }
    },
  }
}

export default defineConfig({
  plugins: [fixMissingThemes(), react()],
})
