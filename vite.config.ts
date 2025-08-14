import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/nfc-photo-frame/',
  plugins: [react()],
})
