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
      // ── /api/ensure-profile ─────────────────────────────────────────────────
      // Garantit que le profil DB de l'utilisateur courant existe.
      // Appelé au chargement de TeamPage pour débloquer les lectures RLS
      // quand le profil admin n'a pas encore été créé manuellement.
      server.middlewares.use(
        '/api/ensure-profile',
        async (req: IncomingMessage, res: ServerResponse) => {
          res.setHeader('Content-Type', 'application/json');
          if (req.method !== 'POST') { res.statusCode = 405; res.end('{}'); return; }

          const rawBody = await new Promise<string>((resolve, reject) => {
            let d = '';
            req.on('data', (c: Buffer) => { d += c.toString(); });
            req.on('end', () => resolve(d));
            req.on('error', reject);
          });

          let token = '';
          try { token = (JSON.parse(rawBody) as { adminToken: string }).adminToken; } catch { /**/ }

          const supabaseUrl    = process.env.VITE_SUPABASE_URL?.replace(/\/$/, '');
          const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          const OWNER_EMAIL    = process.env.OWNER_EMAIL ?? 'gbeffansylvain@gmail.com';

          if (!supabaseUrl || !serviceRoleKey || !token) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Paramètres manquants.' }));
            return;
          }

          const svcH = {
            'Content-Type': 'application/json',
            'apikey': serviceRoleKey,
            'Authorization': `Bearer ${serviceRoleKey}`,
          };

          // Vérifier le token
          const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
            headers: { 'apikey': serviceRoleKey, 'Authorization': `Bearer ${token}` },
          });
          if (!userRes.ok) { res.statusCode = 401; res.end(JSON.stringify({ error: 'Session invalide.' })); return; }

          const authUser = await userRes.json() as { id: string; email?: string };

          // Chercher le profil existant
          const profRes = await fetch(
            `${supabaseUrl}/rest/v1/profiles?id=eq.${authUser.id}&select=id,role,full_name,email,is_active&limit=1`,
            { headers: svcH },
          );
          const existing = await profRes.json() as Array<{ id: string; role: string }>;

          if (existing.length) {
            // Profil déjà présent — rien à faire
            res.statusCode = 200;
            res.end(JSON.stringify({ created: false, profile: existing[0] }));
            return;
          }

          // Profil absent : on ne le crée que pour l'owner connu
          if (authUser.email?.toLowerCase() !== OWNER_EMAIL.toLowerCase()) {
            res.statusCode = 403;
            res.end(JSON.stringify({ error: 'Profil introuvable.' }));
            return;
          }

          // Créer le profil admin de l'owner
          const upsert = await fetch(`${supabaseUrl}/rest/v1/profiles`, {
            method: 'POST',
            headers: { ...svcH, 'Prefer': 'resolution=merge-duplicates' },
            body: JSON.stringify({
              id: authUser.id,
              full_name: 'Sylvain',
              role: 'Admin',
              email: authUser.email,
              is_active: true,
            }),
          });

          if (!upsert.ok) {
            const err = await upsert.json() as { message?: string };
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message ?? 'Impossible de créer le profil.' }));
            return;
          }

          res.statusCode = 200;
          res.end(JSON.stringify({ created: true }));
        },
      );

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

          // Email de l'owner — seul fallback autorisé si le profil DB est absent
          const OWNER_EMAIL = process.env.OWNER_EMAIL ?? 'gbeffansylvain@gmail.com';

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

          const callerUser = await callerRes.json() as { id: string; email?: string };

          // 2. Vérifier que l'appelant est Admin
          //    Cherche le profil en DB (service_role bypasse RLS).
          //    Si absent mais que c'est l'owner, on crée son profil Admin à la volée
          //    pour corriger le bootstrap manquant.
          const profileRes = await fetch(
            `${supabaseUrl}/rest/v1/profiles?id=eq.${callerUser.id}&select=role&limit=1`,
            { headers: authHeaders },
          );
          const profiles = await profileRes.json() as Array<{ role: string }>;

          if (!profiles.length) {
            // Profil absent en base
            if (callerUser.email?.toLowerCase() === OWNER_EMAIL.toLowerCase()) {
              // C'est l'owner : créer son profil Admin puis continuer
              await fetch(`${supabaseUrl}/rest/v1/profiles`, {
                method: 'POST',
                headers: { ...authHeaders, 'Prefer': 'resolution=merge-duplicates' },
                body: JSON.stringify({
                  id: callerUser.id,
                  full_name: 'Sylvain',
                  role: 'Admin',
                  email: callerUser.email,
                  is_active: true,
                }),
              });
            } else {
              res.statusCode = 403;
              res.end(JSON.stringify({ error: 'Aucun profil Admin trouvé pour cet utilisateur.' }));
              return;
            }
          } else if (profiles[0].role !== 'Admin') {
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
