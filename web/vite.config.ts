import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // O mesmo build funciona na raiz local e numa rota HTTPS isolada.
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5180,
    strictPort: true,
    // Em desenvolvimento a API vem do servidor Python, que roda o coletor.
    proxy: { '/api': { target: 'http://127.0.0.1:5199', changeOrigin: true } },
  },
})
