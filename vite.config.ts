import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createClient } from '@supabase/supabase-js';
import type { IncomingMessage, ServerResponse } from 'node:http';

// ── Plugin : Admin API endpoint (Node.js côté serveur) ──────────────────────
// Crée les utilisateurs via l'Admin API Supabase (service_role key).
// Le navigateur n'appelle que POST /api/create-member — la service_role key
// n'est JAMAIS exposée au client, et la session admin n'est jamais touchée.
function supabaseAdminApiPlugin() {
  return {
    name: 'supabase-admin-api',
    configureServer(server: { middlewares: { use: (path: string, fn: (req: IncomingMessage, res: ServerResponse) => void) => void } }) {
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
          const body = await new Promise<string>((resolve, reject) => {
            let data = '';
            req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
            req.on('end', () => resolve(data));
            req.on('error', reject);
          });

          let payload: {
            email: string;
            password: string;
            name: string;
            role: string;
            adminToken: string;
          };
          try {
            payload = JSON.parse(body);
          } catch {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Corps de requête invalide.' }));
            return;
          }

          const { email, password, name, role, adminToken } = payload;

          const supabaseUrl     = process.env.VITE_SUPABASE_URL;
          const serviceRoleKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

          if (!supabaseUrl || !serviceRoleKey) {
            res.statusCode = 500;
            res.end(JSON.stringify({
              error: 'Configuration serveur manquante. Ajoutez SUPABASE_SERVICE_ROLE_KEY dans les secrets Replit.',
            }));
            return;
          }

          // Client Admin — pas de persistance de session locale
          const admin = createClient(supabaseUrl, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false },
          });

          // Vérifier que l'appelant est bien un Admin connecté
          const { data: { user: caller }, error: authErr } = await admin.auth.getUser(adminToken);
          if (authErr || !caller) {
            res.statusCode = 401;
            res.end(JSON.stringify({ error: 'Session invalide ou expirée.' }));
            return;
          }

          const { data: callerProfile } = await admin
            .from('profiles')
            .select('role')
            .eq('id', caller.id)
            .single();

          if (callerProfile?.role !== 'Admin') {
            res.statusCode = 403;
            res.end(JSON.stringify({ error: 'Réservé aux administrateurs.' }));
            return;
          }

          // Créer l'utilisateur via l'Admin API
          // → GoTrue ne diffuse pas d'événement de session aux autres clients
          const { data: created, error: createErr } = await admin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name: name },
          });

          if (createErr) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: createErr.message }));
            return;
          }

          // Créer/mettre à jour le profil
          const { error: profileErr } = await admin
            .from('profiles')
            .upsert(
              { id: created.user.id, full_name: name, role, email, is_active: true },
              { onConflict: 'id' },
            );

          if (profileErr) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: profileErr.message }));
            return;
          }

          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, userId: created.user.id }));
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
