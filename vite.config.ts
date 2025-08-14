import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages 用にベースを固定（あなたのリポジトリ名）
export default defineConfig({
  base: '/nfc-photo-frame/',
  plugins: [react()],
})
