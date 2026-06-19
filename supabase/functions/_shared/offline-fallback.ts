// Offline fallback for Mbuta Matondo and the Lari translator when the AI gateway
// is unavailable (402 credits exhausted, 429 rate-limited, 5xx, network error).
// Strategy: corpus-only lookup. NEVER invents new Lari forms.

import corpus from "./mbuta-corpus-v2.json" with { type: "json" };

type Phrase = { kikongo: string; fr: string; note?: string };
type Mot = { kikongo: string; fr: string; note?: string };

interface CorpusV2 {
  presentation: { phrases: Phrase[] };
  salutations: { phrases: Phrase[] };
  gestion_lecon: { phrases: Phrase[] };
  corrections_encouragements: { phrases: Phrase[] };
  questions_sur_leleve: { phrases: Phrase[] };
  vocabulaire_de_base?: { mots: Mot[] };
  phrases_identite?: { phrases: Phrase[] };
}

const C = corpus as unknown as CorpusV2;

// ---------- Normalisation ----------

export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.,;:«»"'()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  return norm(s).split(" ").filter(Boolean);
}

// ---------- Dictionnaire bilingue construit depuis le corpus ----------

type Pair = { fr: string; lari: string; note?: string };

const STATIC_PAIRS: Pair[] = (() => {
  const out: Pair[] = [];
  const push = (kikongo: string, fr: string, note?: string) => {
    if (kikongo && fr) out.push({ lari: kikongo.trim(), fr: fr.trim(), note });
  };
  const sections: { phrases?: Phrase[]; mots?: Mot[] }[] = [
    C.presentation, C.salutations, C.gestion_lecon,
    C.corrections_encouragements, C.questions_sur_leleve,
    C.phrases_identite ?? { phrases: [] },
    C.vocabulaire_de_base ?? { mots: [] },
  ];
  for (const sec of sections) {
    sec.phrases?.forEach((p) => push(p.kikongo, p.fr, p.note));
    sec.mots?.forEach((m) => push(m.kikongo, m.fr, m.note));
  }
  return out;
})();

function buildIndex(extra: Pair[] = []) {
  const all = [...STATIC_PAIRS, ...extra];
  const frToLari = new Map<string, Pair>();
  const lariToFr = new Map<string, Pair>();
  // Sort by length DESC so longer matches win when scanning n-grams
  const byLariLen = [...all].sort((a, b) => b.lari.length - a.lari.length);
  const byFrLen = [...all].sort((a, b) => b.fr.length - a.fr.length);
  for (const p of byFrLen) {
    const k = norm(p.fr);
    if (k && !frToLari.has(k)) frToLari.set(k, p);
  }
  for (const p of byLariLen) {
    const k = norm(p.lari);
    if (k && !lariToFr.has(k)) lariToFr.set(k, p);
  }
  return { all, frToLari, lariToFr };
}

// ---------- Traduction offline ----------

export interface OfflineCorrection {
  source_text: string;
  corrected_translation: string;
  notes?: string | null;
}

export interface OfflineTranslation {
  translation: string;
  mandombe: string;
  ipa: string;
  notes: string;
  offline: true;
}

/**
 * Mode dégradé du traducteur : pas d'IA, lookup exact dans le corpus + corrections expert,
 * puis fallback mot-à-mot avec [?mot?] pour les inconnus. Ne traduit que fr<->lari.
 * Pour les autres langues, on renvoie un message clair.
 */
export function translateOffline(
  text: string,
  direction: string,
  corrections: OfflineCorrection[] = [],
): OfflineTranslation {
  const extra: Pair[] = corrections.map((c) => ({
    fr: c.source_text,
    lari: c.corrected_translation,
    note: c.notes ?? undefined,
  }));
  const idx = buildIndex(extra);

  const baseNotes =
    "Mode hors ligne : crédits IA épuisés. Réponse construite uniquement à partir du corpus Nzo Mikanda et des corrections expert. Aucune invention.";

  // Seuls fr<->lari sont supportés en offline ; les autres langues nécessitent l'IA.
  const supported = direction === "fr-to-lari" || direction === "lari-to-fr";
  if (!supported) {
    return {
      translation: "",
      mandombe: "",
      ipa: "",
      notes:
        "Mode hors ligne : seules les traductions français↔Kikongo Lari sont disponibles sans crédits IA. " +
        "Recharge les crédits pour réactiver les autres langues.",
      offline: true,
    };
  }

  const toLari = direction === "fr-to-lari";
  const lookup = toLari ? idx.frToLari : idx.lariToFr;
  const key = norm(text);

  // 1) Lookup exact (phrase entière)
  const exact = lookup.get(key);
  if (exact) {
    return {
      translation: toLari ? exact.lari : exact.fr,
      mandombe: "",
      ipa: "",
      notes: baseNotes + (exact.note ? ` Note expert : ${exact.note}` : ""),
      offline: true,
    };
  }

  // 2) Scan n-grammes (jusqu'à 6 mots) pour couvrir les expressions
  const toks = tokens(text);
  const out: string[] = [];
  let i = 0;
  const maxN = 6;
  while (i < toks.length) {
    let matched = false;
    for (let n = Math.min(maxN, toks.length - i); n >= 1; n--) {
      const sub = toks.slice(i, i + n).join(" ");
      const hit = lookup.get(sub);
      if (hit) {
        out.push(toLari ? hit.lari : hit.fr);
        i += n;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out.push(`[?${toks[i]}?]`);
      i += 1;
    }
  }

  const translation = out.join(" ");
  const missing = (translation.match(/\[\?[^\]]+\?\]/g) || []).length;
  const notes = missing > 0
    ? `${baseNotes} ${missing} terme(s) non attesté(s) dans le corpus — marqué(s) [?...?].`
    : baseNotes;

  return { translation, mandombe: "", ipa: "", notes, offline: true };
}

// ---------- Mbuta Matondo offline ----------

function wrap(lari: string, fr: string, choices?: { options: string[]; correct: number }): string {
  let out = `<lari>${lari}</lari>\n<fr>${fr}</fr>`;
  if (choices && choices.options.length > 0) {
    out += `\n<choices correct="${choices.correct}">${choices.options.join("|")}</choices>`;
  }
  return out;
}

const GREETING_RE = /\b(bonjour|salut|hello|hi|coucou|mbote|kolele|hey)\b/i;
const NAME_INTRO_RE = /\b(nkumbu (ani|aku)|je m'appelle|mon nom|mon prenom|i am|i'm|me ni)\b/i;
const THANKS_RE = /\b(merci|matondo|thanks|thank you)\b/i;

/**
 * Réponse offline de Mbuta Matondo : phrases prises littéralement du corpus,
 * jamais d'invention. Format <lari>/<fr>/<choices> respecté.
 */
export function mbutaOfflineReply(userMessage: string): string {
  const msg = (userMessage || "").trim();
  const n = norm(msg);

  const offlineNotice =
    "<lari>Ka nzebi a ko.</lari>\n<fr>(Mode hors ligne — crédits IA épuisés. Je réponds uniquement avec des phrases du corpus.)</fr>";

  // Cas 1 : salutation
  if (!n || GREETING_RE.test(n)) {
    return wrap(
      "Mbote ! Nkumbu aku nani ?",
      "Bonjour ! Quel est ton nom ?",
      { options: ["Nkumbu ani ___", "Matondo.", "Ka nzebi a ko."], correct: 0 },
    );
  }

  // Cas 2 : l'élève donne son nom
  if (NAME_INTRO_RE.test(n)) {
    return wrap("Ni buna ! Kolele ?", "Très bien ! Comment vas-tu ?", {
      options: ["Nkolele kuani.", "Ka nzebi a ko.", "Matondo."],
      correct: 0,
    });
  }

  // Cas 3 : remerciements
  if (THANKS_RE.test(n)) {
    return wrap("Matondo mpe nge !", "Merci à toi aussi !");
  }

  // Cas 4 : tente un lookup direct dans le corpus
  const idx = buildIndex();
  const direct = idx.frToLari.get(n) || idx.lariToFr.get(n);
  if (direct) {
    return wrap(direct.lari, direct.fr);
  }

  // Cas 5 : par défaut, on dit qu'on ne sait pas et on relance la leçon
  return [
    offlineNotice,
    wrap(
      "Ta vutukila malongi meto. Sola mvutu ya mbote :",
      "Revenons à notre leçon. Choisis la bonne réponse :",
      { options: ["Mbote", "Matondo", "Ka nzebi a ko"], correct: 0 },
    ),
  ].join("\n");
}
