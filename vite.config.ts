import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Deploy lên GitHub Pages tại https://<user>.github.io/Learn_Chinese_Web/
export default defineConfig({
  plugins: [react()],
  base: '/Learn_Chinese_Web/',
  server: {
    host: true, // mở bằng IP LAN để test trên điện thoại thật: vite --host
    port: 5173,
  },
  build: {
    outDir: 'dist',
  },
})
