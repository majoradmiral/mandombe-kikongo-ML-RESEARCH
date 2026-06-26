Ajouter un override phonétique pour `mazuji` afin que la syllabe finale soit lue /ʒi/ (jamais /dzi/).

## Changement

Dans `supabase/functions/elevenlabs-tts-lari/index.ts`, ajouter au bloc `PHONETIC_OVERRIDES` :

```ts
"mazuji": "ma-zou-ji",
"Mazuji": "Ma-zou-ji",
```

- `zou` → garantit /zu/ (français), évite que ElevenLabs glisse vers /dz/.
- `-ji` isolé par tiret → déclenche la règle existante /ʒ/ ("Julien"), comme pour `bujitu` et `mbaji`.

## Déploiement

Redéployer la fonction `elevenlabs-tts-lari`. Le cache `tts-lari-cached` régénérera automatiquement au prochain clic (hash basé sur le texte source, pas sur la phonétique).

## Mémoire

Mettre à jour `mem://audio/tts-mbaji-rule.md` (ou créer une note courte) pour consigner : "mazuji = /mazuʒi/, dernière syllabe en /ʒi/, jamais /dzi/".
