import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Actions �� BASE_PATH �𒍓��i/REPO_NAME/�j�B���[�J���� '/'�B
const basePath = process.env.BASE_PATH || '/'

export default defineConfig({
  plugins: [react()],
  base: basePath
})
