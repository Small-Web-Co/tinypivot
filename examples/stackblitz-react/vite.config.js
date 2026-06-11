import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// tinypivot-react@1.0.81 style.css starts with `@import './themes.css'` but
// themes.css was accidentally omitted from the npm dist. This plugin creates an
// empty placeholder so the import resolves. The full styles (including themes)
// live in style.css itself after the @import line, so nothing visual is lost.
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
        writeFileSync(themesDest, '/* themes are included in style.css */\n', 'utf-8')
      }
    },
  }
}

export default defineConfig({
  plugins: [fixMissingThemes(), react()],
})
