import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Locally-uploaded admin photos. Backend's storage service returns
      // URLs like `/static/uploads/products/<uuid>.jpg` which the FastAPI
      // StaticFiles mount serves on port 8000. In dev the React app runs
      // on 5173, so we proxy these requests through to the API.
      '/static/uploads': 'http://localhost:8000',
    },
  },
})
