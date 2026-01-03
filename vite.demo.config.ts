import type { Plugin } from 'vite'
import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'

/**
 * Vite plugin to handle AI proxy requests locally
 * This allows `pnpm demo` to work without needing `vercel dev`
 */
function aiProxyPlugin(): Plugin {
  let env: Record<string, string> = {}

  return {
    name: 'ai-proxy',
    configResolved(config) {
      // Load env from project root
      env = loadEnv(config.mode, resolve(__dirname), '')
    },
    configureServer(server) {
      server.middlewares.use('/api/ai-proxy', async (req, res) => {
        // CORS
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

        if (req.method === 'OPTIONS') {
          res.statusCode = 200
          res.end()
          return
        }

        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }

        // Read body
        const chunks: Buffer[] = []
        for await (const chunk of req) {
          chunks.push(chunk as Buffer)
        }
        const body = JSON.parse(Buffer.concat(chunks).toString())

        // Get API key (unified approach - auto-detect provider from key format)
        const apiKey = env.AI_API_KEY
        if (!apiKey) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({
            error: 'No AI API key configured. Add AI_API_KEY to your .env file.',
          }))
          return
        }

        // Detect provider from key format
        const isAnthropic = apiKey.startsWith('sk-ant-')
        const isOpenRouter = apiKey.startsWith('sk-or-')

        // Get default model based on provider
        const getDefaultModel = () => {
          if (isAnthropic)
            return 'claude-3-haiku-20240307'
          if (isOpenRouter)
            return 'anthropic/claude-3-haiku'
          return 'gpt-4o-mini'
        }

        try {
          let response: string
          const model = env.AI_MODEL || getDefaultModel()
          const messages = body.messages || []

          console.log(`[AI Proxy] Provider: ${isAnthropic ? 'Anthropic' : isOpenRouter ? 'OpenRouter' : 'OpenAI'}, Model: ${model}`)

          if (isOpenRouter) {
            const apiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': 'https://tiny-pivot.com',
                'X-Title': 'TinyPivot AI Analyst',
              },
              body: JSON.stringify({
                model,
                max_tokens: 2048,
                messages,
              }),
            })

            if (!apiRes.ok) {
              const errorText = await apiRes.text()
              throw new Error(`OpenRouter API error: ${apiRes.status} - ${errorText}`)
            }

            const data = await apiRes.json()
            response = data.choices?.[0]?.message?.content || 'No response generated'
          }
          else if (isAnthropic) {
            const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
              },
              body: JSON.stringify({
                model,
                max_tokens: 2048,
                messages: messages.map((m: { role: string, content: string }) => ({
                  role: m.role === 'system' ? 'user' : m.role,
                  content: m.content,
                })),
              }),
            })

            if (!apiRes.ok) {
              const errorText = await apiRes.text()
              throw new Error(`Anthropic API error: ${apiRes.status} - ${errorText}`)
            }

            const data = await apiRes.json()
            response = data.content?.[0]?.text || 'No response generated'
          }
          else {
            // OpenAI
            const apiRes = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model,
                max_tokens: 2048,
                messages,
              }),
            })

            if (!apiRes.ok) {
              const errorText = await apiRes.text()
              throw new Error(`OpenAI API error: ${apiRes.status} - ${errorText}`)
            }

            const data = await apiRes.json()
            response = data.choices?.[0]?.message?.content || 'No response generated'
          }

          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ content: response, model }))
        }
        catch (error) {
          console.error('[AI Proxy Error]', error)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({
            error: error instanceof Error ? error.message : 'Unknown error',
          }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // Load env vars from project root
  const env = loadEnv(mode, resolve(__dirname), '')

  return {
    plugins: [vue(), aiProxyPlugin()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'packages/vue/src'),
        'tinypivot/style.css': resolve(__dirname, 'packages/vue/src/style.css'),
        'tinypivot': resolve(__dirname, 'packages/vue/src/index.ts'),
        '@smallwebco/tinypivot-core': resolve(__dirname, 'packages/core/src/index.ts'),
      },
    },
    // Expose AI_MODEL to client code
    define: {
      __AI_MODEL__: JSON.stringify(env.AI_MODEL || 'AI Assistant'),
    },
    root: 'demo',
    envDir: resolve(__dirname), // Load .env from project root
    base: '/',
    build: {
      outDir: '../dist-demo',
      emptyOutDir: true,
    },
    server: {
      port: 3000,
      open: true,
    },
    optimizeDeps: {
      include: ['@tanstack/vue-table'],
    },
  }
})
