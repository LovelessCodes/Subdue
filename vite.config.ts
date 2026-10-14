import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    {
      // better-auth rate limits per client IP (single-value x-forwarded-for);
      // Vite's dev server has no such header, so provide the socket address
      // like serve.ts does in production.
      name: 'subdue-client-ip',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          const address = req.socket.remoteAddress
          if (address) {
            req.headers['x-forwarded-for'] = address
          }
          next()
        })
      },
    },
    devtools(),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
  server: {
    // Subdue accepts any host in production (dynamic base URL); the dev
    // server should not be stricter than the real thing.
    allowedHosts: true,
  },
})

export default config
