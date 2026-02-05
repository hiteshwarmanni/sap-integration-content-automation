import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Optimize for production deployment on SAP BTP CF
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: false, // Disable sourcemaps for smaller build size in production
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Let Vite automatically split chunks optimally
        // This works better with UI5 WebComponents
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  }
})
