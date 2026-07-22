import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Note: les endpoints /api/* (ensure-profile, create-member, delete-member,
// toggle-member-active, reset-member-password) sont gérés par server.js en
// production. En développement local, les appels /api/* partent vers le même
// serveur Vite sur le port 5000 — si vous avez besoin de les tester en dev,
// lancez server.js séparément et ajoutez un proxy ici.

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5000,
    allowedHosts: true,
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
