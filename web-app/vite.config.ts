import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { handleChatStreamRequest } from './src/lib/stream-handler.ts'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    {
      name: 'chat-stream-plugin',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url === '/api/chat-stream') {
            await handleChatStreamRequest(req, res)
            return
          }
          next()
        })
      },
    },
  ],
})

export default config
