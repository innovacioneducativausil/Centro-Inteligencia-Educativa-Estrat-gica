import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

//----------------TI-52----------------
// Ninguna API key debe viajar al bundle del cliente: las llamadas a IA
// (Gemini/Groq/HuggingFace) se hacen server-side (server/routes/ai.js).
// No agregar aqui variables `define` con secretos de servidor.
export default defineConfig(() => {
  return {
    plugins: [react()],
    build: {
      sourcemap: false,
      minify: true,
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:3002',
          changeOrigin: true,
        }
      }
    }
  }
})
