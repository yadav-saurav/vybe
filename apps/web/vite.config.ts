import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API = process.env.VYBE_API ?? 'http://127.0.0.1:4000';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: '127.0.0.1', proxy: { '/api': API, '/media': API } },
  preview: { port: 5173, host: '127.0.0.1', proxy: { '/api': API, '/media': API } },
  build: { target: 'es2022', sourcemap: true },
  test: { environment: 'jsdom', globals: true },
} as never);
