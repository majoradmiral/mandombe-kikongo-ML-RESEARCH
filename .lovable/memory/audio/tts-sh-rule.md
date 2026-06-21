---
name: TTS sh rule (IMMUABLE)
description: Règle de prononciation immuable site-wide — "sh" + voyelle = /ʃ/ comme "shoes" (anglais) ou "chat" (français). Jamais /tʃ/ (church) ni /s/. Cluster "tsh" préservé pour /tʃ/ voulu.
type: feature
---

# Règle immuable — prononciation de "sh"

**Sur tout le site, dans toutes les fonctionnalités (TTS, leçons, traducteur, Mbuta Matondo, dictionnaire, exercices), "sh" + voyelle se prononce TOUJOURS /ʃ/** — exactement comme dans :
- anglais "**sh**oes", "**sh**ip"
- français "**ch**at", "**ch**ien"

Jamais /tʃ/ (anglais "**ch**urch"), jamais /s/.

## Exemples corpus
- `shama` (aller) → /ʃama/
- `shemi` (je vais) → /ʃɛmi/
- `moshi` / `mosi` (un) → /moʃi/
- `hakimoshi` → /h'akimoʃi/
- `Ta longoka hakimoshi!` → /ta longoka h'akimoʃi/

## Implémentation (à ne pas dévier)
Règle appliquée dans **les deux** moteurs :
- `src/lib/lari-phonetic-engine.ts`
- `supabase/functions/elevenlabs-tts-lari/index.ts`

Pattern :
```
(^|[^t])sh([aeiouAEIOU])  →  $1ch$2
```

- Le négatif `[^t]` préserve le cluster `tsh` voulu /tʃ/ (ex. `tshibuka`, `tshina`).
- Overrides mots utiles : `shama → chama`, `shemi → chémi`, `moshi → mochi`.

## Règle orthographique du corpus
Écrire toujours `sh` (jamais `ch`) pour le phonème /ʃ/ dans le Lari. Le moteur phonétique convertit en `ch` français uniquement pour ElevenLabs afin de garantir /ʃ/.

## Interdictions
- Ne jamais supprimer la règle regex `sh → ch`.
- Ne jamais remplacer `sh` par `ch` dans le corpus orthographique.
- Ne jamais introduire d'override qui renvoie `sh` vers /s/ ou /tʃ/.
