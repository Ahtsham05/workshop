import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    TanStackRouterVite({
      target: 'react',
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    cors: true,
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: 5173,
      clientPort: 5173,
    },
  },
  optimizeDeps: {
    // Force react + react-dom + react-redux into one pre-bundle pass so they
    // all share a single React instance.  Without this, Vite may emit separate
    // chunks (e.g. chunk-TJE776R7 for React, chunk-YSFGEKTM for react-redux)
    // where each chunk has its own React copy — causing the
    // "Cannot read properties of null (reading 'useContext')" crash.
    include: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-redux',
      '@reduxjs/toolkit',
    ],
  },
  resolve: {
    // Ensure only one copy of React exists in the bundle.
    // Without this, Vite may pre-bundle react-redux (or other libs) with their
    // own React copy, causing the "Invalid hook call" / useContext null crash.
    dedupe: ['react', 'react-dom', 'react-redux'],
    alias: {
      '@': path.resolve(__dirname, './src'),

      // fix loading all icon chunks in dev mode
      // https://github.com/tabler/tabler-icons/issues/1233
      '@tabler/icons-react': '@tabler/icons-react/dist/esm/icons/index.mjs',
    },
  },
})
