import { reactRouter } from '@react-router/dev/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [reactRouter()],
  build: {
    // Every route shares one shell, and the site is pre-rendered, so a single
    // stylesheet link per page beats per-chunk CSS split across 37 documents.
    cssCodeSplit: false,
  },
})
