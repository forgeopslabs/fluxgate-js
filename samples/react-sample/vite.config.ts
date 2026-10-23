import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // Read samples/.env, but expose only the Web client's settings to the browser.
  envDir: '..',
  envPrefix: 'FLUXGATE_WEB_',
  // Port 28173 is one of the Web client's allowed origins (samples/setup.sh).
  server: { port: 28173, strictPort: true },
  preview: { port: 28173, strictPort: true },
});
