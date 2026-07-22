---
name: GitHub push workflow
description: L'utilisateur teste via Render, pas via le preview Replit — chaque modification doit être poussée sur GitHub immédiatement.
---

# Règle : Push GitHub systématique

**Règle :** Après chaque modification de fichier(s), toujours exécuter `git push origin main` avant de déclarer le travail terminé.

**Why:** L'utilisateur teste l'application via son déploiement Render (lié au dépôt GitHub `suivi229-lab/Suivi229app`). Sans push, Render ne voit pas les changements et l'utilisateur croit que les corrections ne fonctionnent pas.

**How to apply:** À la fin de chaque tour de modifications (même petites), ajouter un appel `git push origin main` via ShellExec. Ne pas attendre que l'utilisateur le demande.
