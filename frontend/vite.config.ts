import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Požiadavky na /api posiela Vite ďalej na backend (v Dockeri kontajner "backend")
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': process.env.API_URL ?? 'http://localhost:3000' } },
});
