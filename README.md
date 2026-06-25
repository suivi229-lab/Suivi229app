# Suivi 229+

Application de gestion et tracking de véhicules (GPS).

## Modules
- **Dashboard** — Vue densemble en temps réel
- **CRM & Abonnements** — Gestion clients, véhicules, abonnements annuels
- **Stock & Logistique** — Inventaire traceurs GT06/JT808 et cartes SIM
- **Facturation** — Factures, transactions, comptabilité
- **Nouvelle Installation** — Validation dinstallation en un clic

## Stack
- React 18 + TypeScript + Vite
- Supabase (PostgreSQL + Auth)
- Tailwind CSS

## Rôles utilisateurs
| Rôle | Accès |
|------|-------|
| Admin | Tout |
| Technicien | Stock + Installation |
| Observateur | Dashboard (lecture) |
| Investisseur | Dashboard (lecture) |

## Variables denvironnement
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## Démarrer
```bash
npm install
npm run dev
```
