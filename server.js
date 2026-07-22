import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? 'gbeffansylvain@gmail.com';

function getSupabaseConfig() {
  const supabaseUrl    = (process.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  return { supabaseUrl, serviceRoleKey };
}

function svcHeaders(serviceRoleKey) {
  return {
    'Content-Type':  'application/json',
    'apikey':        serviceRoleKey,
    'Authorization': `Bearer ${serviceRoleKey}`,
  };
}

// ── /api/ensure-profile ─────────────────────────────────────────────────────
app.post('/api/ensure-profile', async (req, res) => {
  const { adminToken } = req.body ?? {};
  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();

  if (!supabaseUrl || !serviceRoleKey || !adminToken) {
    return res.status(400).json({ error: 'Paramètres manquants.' });
  }

  const svcH = svcHeaders(serviceRoleKey);

  // Vérifier le token
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { 'apikey': serviceRoleKey, 'Authorization': `Bearer ${adminToken}` },
  });
  if (!userRes.ok) return res.status(401).json({ error: 'Session invalide.' });

  const authUser = await userRes.json();

  // Chercher le profil existant
  const profRes  = await fetch(
    `${supabaseUrl}/rest/v1/profiles?id=eq.${authUser.id}&select=id,role,full_name,email,is_active&limit=1`,
    { headers: svcH },
  );
  const existing = await profRes.json();

  if (existing.length) return res.json({ created: false, profile: existing[0] });

  // Profil absent : on ne le crée que pour l'owner connu
  if (authUser.email?.toLowerCase() !== OWNER_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: 'Profil introuvable.' });
  }

  const upsert = await fetch(`${supabaseUrl}/rest/v1/profiles`, {
    method:  'POST',
    headers: { ...svcH, 'Prefer': 'resolution=merge-duplicates' },
    body:    JSON.stringify({
      id:        authUser.id,
      full_name: 'Sylvain',
      role:      'Admin',
      email:     authUser.email,
      is_active: true,
    }),
  });

  if (!upsert.ok) {
    const err = await upsert.json();
    return res.status(500).json({ error: err.message ?? 'Impossible de créer le profil.' });
  }

  return res.json({ created: true });
});

// ── /api/create-member ───────────────────────────────────────────────────────
app.post('/api/create-member', async (req, res) => {
  const { email, password, name, role, adminToken } = req.body ?? {};
  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY manquant.' });
  }

  const authHeaders = svcHeaders(serviceRoleKey);

  // 1. Vérifier l'appelant
  const callerRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { 'apikey': serviceRoleKey, 'Authorization': `Bearer ${adminToken}` },
  });
  if (!callerRes.ok) return res.status(401).json({ error: 'Session invalide ou expirée.' });

  const callerUser = await callerRes.json();

  // 2. Vérifier que l'appelant est Admin
  const profileRes = await fetch(
    `${supabaseUrl}/rest/v1/profiles?id=eq.${callerUser.id}&select=role&limit=1`,
    { headers: authHeaders },
  );
  const profiles = await profileRes.json();

  if (!profiles.length) {
    if (callerUser.email?.toLowerCase() === OWNER_EMAIL.toLowerCase()) {
      // Owner sans profil → on le crée à la volée
      await fetch(`${supabaseUrl}/rest/v1/profiles`, {
        method:  'POST',
        headers: { ...authHeaders, 'Prefer': 'resolution=merge-duplicates' },
        body:    JSON.stringify({
          id:        callerUser.id,
          full_name: 'Sylvain',
          role:      'Admin',
          email:     callerUser.email,
          is_active: true,
        }),
      });
    } else {
      return res.status(403).json({ error: 'Aucun profil Admin trouvé pour cet utilisateur.' });
    }
  } else if (profiles[0].role !== 'Admin') {
    return res.status(403).json({ error: 'Réservé aux administrateurs.' });
  }

  // 3. Créer l'utilisateur via l'Admin API
  const createRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method:  'POST',
    headers: authHeaders,
    body:    JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name },
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.json();
    return res.status(400).json({ error: err.message ?? err.msg ?? 'Erreur de création.' });
  }

  const newUser = await createRes.json();

  // 4. Créer / mettre à jour le profil
  const upsertRes = await fetch(`${supabaseUrl}/rest/v1/profiles`, {
    method:  'POST',
    headers: { ...authHeaders, 'Prefer': 'resolution=merge-duplicates' },
    body:    JSON.stringify({ id: newUser.id, full_name: name, role, email, is_active: true }),
  });

  if (!upsertRes.ok) {
    const err = await upsertRes.json();
    return res.status(400).json({ error: err.message ?? 'Erreur lors de la création du profil.' });
  }

  return res.json({ success: true, userId: newUser.id });
});

// ── Fichiers statiques (build Vite) ──────────────────────────────────────────
const distPath = join(__dirname, 'dist');
app.use(express.static(distPath));

// SPA fallback : toute route inconnue → index.html
app.get('/{*splat}', (_req, res) => {
  res.sendFile(join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;
createServer(app).listen(PORT, () => {
  console.log(`✅ Serveur démarré sur le port ${PORT}`);
});
