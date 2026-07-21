import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';

// ── Plugin : Admin API endpoint (Node.js côté serveur) ──────────────────────
// Utilise fetch natif (Node ≥ 18) + l'API REST Supabase directement,
// sans instancier le client Supabase JS (qui crashe sur Node < 22 à cause
// de l'absence de WebSocket natif lors de l'init Realtime).
function supabaseAdminApiPlugin() {
  return {
    name: 'supabase-admin-api',
    configureServer(server: {
      middlewares: { use: (path: string, fn: (req: IncomingMessage, res: ServerResponse) => void) => void };
    }) {
      server.middlewares.use(
        '/api/create-member',
        async (req: IncomingMessage, res: ServerResponse) => {
          res.setHeader('Content-Type', 'application/json');

          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end(JSON.stringify({ error: 'Method not allowed' }));
            return;
          }

          // Lire le body
          const rawBody = await new Promise<string>((resolve, reject) => {
            let data = '';
            req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
            req.on('end', () => resolve(data));
            req.on('error', reject);
          });

          let payload: { email: string; password: string; name: string; role: string; adminToken: string };
          try {
            payload = JSON.parse(rawBody);
          } catch {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Corps de requête invalide.' }));
            return;
          }

          const { email, password, name, role, adminToken } = payload;

          const supabaseUrl    = process.env.VITE_SUPABASE_URL?.replace(/\/$/, '');
          const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

          if (!supabaseUrl || !serviceRoleKey) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'SUPABASE_SERVICE_ROLE_KEY manquant dans les secrets Replit.' }));
            return;
          }

          const authHeaders = {
            'Content-Type': 'application/json',
            'apikey':        serviceRoleKey,
            'Authorization': `Bearer ${serviceRoleKey}`,
          };

          // 1. Vérifier que l'appelant est authentifié
          const callerRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
            headers: {
              'apikey':        serviceRoleKey,
              'Authorization': `Bearer ${adminToken}`,
            },
          });

          if (!callerRes.ok) {
            res.statusCode = 401;
            res.end(JSON.stringify({ error: 'Session invalide ou expirée.' }));
            return;
          }

          const callerUser = await callerRes.json() as { id: string };

          // 2. Vérifier que l'appelant est Admin
          const profileRes = await fetch(
            `${supabaseUrl}/rest/v1/profiles?id=eq.${callerUser.id}&select=role&limit=1`,
            { headers: authHeaders },
          );
          const profiles = await profileRes.json() as Array<{ role: string }>;

          if (!profiles.length || profiles[0].role !== 'Admin') {
            res.statusCode = 403;
            res.end(JSON.stringify({ error: 'Réservé aux administrateurs.' }));
            return;
          }

          // 3. Créer l'utilisateur via l'Admin API
          // → GoTrue ne diffuse pas d'événement de session aux autres clients
          const createRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({
              email,
              password,
              email_confirm: true,
              user_metadata: { full_name: name },
            }),
          });

          if (!createRes.ok) {
            const err = await createRes.json() as { message?: string; msg?: string };
            res.statusCode = 400;
            res.end(JSON.stringify({ error: err.message ?? err.msg ?? 'Erreur de création.' }));
            return;
          }

          const newUser = await createRes.json() as { id: string };

          // 4. Créer / mettre à jour le profil
          const upsertRes = await fetch(`${supabaseUrl}/rest/v1/profiles`, {
            method: 'POST',
            headers: { ...authHeaders, 'Prefer': 'resolution=merge-duplicates' },
            body: JSON.stringify({ id: newUser.id, full_name: name, role, email, is_active: true }),
          });

          if (!upsertRes.ok) {
            const err = await upsertRes.json() as { message?: string };
            res.statusCode = 400;
            res.end(JSON.stringify({ error: err.message ?? 'Erreur lors de la création du profil.' }));
            return;
          }

          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, userId: newUser.id }));
        },
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), supabaseAdminApiPlugin()],
  server: {
    host: '0.0.0.0',
    port: 5000,
    allowedHosts: true,
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
