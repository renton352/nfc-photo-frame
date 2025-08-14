import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Actions が BASE_PATH を注入（/REPO_NAME/）。ローカルは '/'。
const basePath = process.env.BASE_PATH || '/'

export default defineConfig({
  plugins: [react()],
  base: basePath
})
