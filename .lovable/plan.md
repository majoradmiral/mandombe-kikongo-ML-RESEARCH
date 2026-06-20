## Problème

Le dictionnaire affiche toutes les entrées de `translation_corrections`, y compris les longues phrases/consignes traduites avec le Traducteur (ex : "écris un mini-dialogue (5 répliques)…"). Ce ne sont pas des entrées de dictionnaire — ce sont des traductions ad hoc.

## Correctif (1 fichier, frontend uniquement)

Dans `src/pages/Dictionary.tsx`, à l'intérieur de `fetchCorrections`, ajouter un filtre pour ne garder que les vrais lemmes :

- Ignorer toute correction où `lari` ou la traduction comporte :
  - plus de **4 mots** (regex `/\s+/`), **ou**
  - plus de **40 caractères**, **ou**
  - contient `.`, `?`, `!`, `,`, `;`, `:` ou un retour ligne (signe de phrase).
- Garder uniquement les corrections de type mot / expression courte.

Aucune migration, aucune fonction edge, aucun changement de prix ou de quota. Les corrections longues restent en base (utiles pour le few-shot du traducteur via `mem://features/translator-persistence`), elles ne sont juste plus listées dans le Buku dia Binsono.

## Optionnel (à confirmer)

Voulez-vous aussi que je masque l'étiquette « Traducteur » sur les cartes du dictionnaire, ou la garder pour les entrées courtes légitimes issues du traducteur ?
