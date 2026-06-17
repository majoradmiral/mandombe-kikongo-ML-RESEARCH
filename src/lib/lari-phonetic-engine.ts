/**
 * ============================================================
 * MOTEUR PHONÉTIQUE LARI (LAADI) — v2
 * Basé sur : Jacquot (1971/1982) + analyse acoustique
 *            Émission "Yiza ta moka" — Denis Malanda
 * ============================================================
 */

const PRENASALIZED: string[] = [
  'ndj', 'tch',
  'mb', 'mp', 'mf', 'mv', 'mw',
  'nd', 'nt', 'ns', 'nz', 'nk',
  'ng', 'ny', 'nl', 'nj',
  'bv', 'pf', 'bf',
  'dj', 'ch', 'sh', 'gn',
];

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);
const DIPHTONGS = new Set(['ia', 'ie', 'io', 'iu', 'ua', 'ue', 'ui', 'ai', 'au']);

/**
 * Découpe un mot lari en syllabes phonologiques.
 * Structure canonique (Jacquot §2.2) : (C)V ou (CC)V
 */
export function syllabify(word: string): string[] {
  const w = word.toLowerCase().trim();
  const syllables: string[] = [];
  let i = 0;

  const clusters = [...PRENASALIZED].sort((a, b) => b.length - a.length);

  while (i < w.length) {
    let onset = '';
    let nucleus = '';

    // Onset: longest cluster first
    let found = false;
    for (const cluster of clusters) {
      if (w.substring(i).startsWith(cluster)) {
        onset = cluster;
        i += cluster.length;
        found = true;
        break;
      }
    }
    if (!found && i < w.length && !VOWELS.has(w[i])) {
      onset = w[i];
      i++;
    }

    // Nucleus: vowel(s)
    if (i < w.length && VOWELS.has(w[i])) {
      nucleus = w[i];
      i++;
      // Long vowel
      if (i < w.length && w[i] === nucleus) {
        nucleus += w[i];
        i++;
      }
      // Diphthong
      else if (
        i < w.length &&
        VOWELS.has(w[i]) &&
        nucleus.length === 1 &&
        DIPHTONGS.has(nucleus + w[i])
      ) {
        nucleus += w[i];
        i++;
      }
    }

    if (onset || nucleus) {
      syllables.push(onset + nucleus);
    } else {
      i++; // safety
    }
  }

  return syllables.filter(s => s.length > 0);
}

// ============================================================
// RÈGLES TTS POUR ELEVEN LABS
// ============================================================

interface PhoneticRule {
  from: RegExp;
  to: string;
  note: string;
}

const ELEVENLABS_RULES: PhoneticRule[] = [
  // ŋ vélaire (n') + k
  { from: /n'ki/g, to: 'nkhi', note: 'ŋki → nkhi' },
  { from: /n'ke/g, to: 'nkhe', note: 'ŋke → nkhe' },
  { from: /n'k([aouAOU])/g, to: 'nk$1', note: 'ŋk + post → nk' },

  // ŋ vélaire (n') + g
  { from: /n'g([iIeE])/g, to: 'ngh$1', note: 'ŋg + ant → ngh' },
  { from: /n'g([aouAOU])/g, to: 'ng$1', note: 'ŋg + post → ng' },

  // ŋ + other consonants
  { from: /n's([aeiouAEIOU])/g, to: 'nhs$1', note: 'ŋs → nhs' },
  { from: /n'z([aeiouAEIOU])/g, to: 'nhz$1', note: 'ŋz → nhz' },
  { from: /n't([iI])/g, to: 'nhti', note: 'ŋti → nhti' },
  { from: /n'v([aeiouAEIOU])/g, to: 'nhv$1', note: 'ŋv → nhv' },
  { from: /n'd([iI])/g, to: 'nhdi', note: 'ŋdi → nhdi' },

  // nj → ndj (affriquée prénasalisée)
  { from: /mpangi/g, to: 'mpan-ghi', note: 'mpangi : g dur' },
  { from: /nj([aeiouAEIOU])/g, to: 'ndj$1', note: 'nj → ndj' },

  // G dur devant i/e
  { from: /ngi/g, to: 'nghi', note: 'ngi → nghi' },
  { from: /nge/g, to: 'nghe', note: 'nge → nghe' },
  { from: /\bgi/g, to: 'guî', note: 'gi initial → guî' },
  { from: /\bge/g, to: 'guê', note: 'ge initial → guê' },

  // /w/ TOUJOURS comme dans "win" (anglais), JAMAIS /v/ — on force la voyelle "ou"
  { from: /\bwa/gi, to: 'oua', note: 'w + a → oua (jamais /va/)' },
  { from: /\bwe/gi, to: 'ouè', note: 'w + e → ouè (jamais /ve/)' },
  { from: /\bwi/gi, to: 'oui', note: 'w + i → oui (jamais /vi/)' },
  { from: /\bwo/gi, to: 'ouo', note: 'w + o → ouo (jamais /vo/)' },
  { from: /\bwu/gi, to: 'ouou', note: 'w + u → ouou' },
  // /w/ intervocalique
  { from: /([aeiou])wa/gi, to: '$1oua', note: '_wa → _oua' },
  { from: /([aeiou])we/gi, to: '$1ouè', note: '_we → _ouè' },
  { from: /([aeiou])wi/gi, to: '$1oui', note: '_wi → _oui' },
  { from: /([aeiou])wo/gi, to: '$1ouo', note: '_wo → _ouo' },

  // /s/ TOUJOURS sourd, JAMAIS voisé /z/ — double le s entre voyelles
  { from: /([aeiouéèêà])s([aeiouéèêà])/gi, to: '$1ss$2', note: 's intervocalique → ss (sourd)' },

  // Sh + voyelle → /ʃ/ (français "ch", garantit la fricative et évite /tʃ/ anglais).
  // Ne touche pas au cluster "tsh" voulu /tʃ/.
  { from: /(^|[^t])sh([aeiouAEIOU])/g, to: '$1ch$2', note: 'sh → ch (/ʃ/, jamais /tʃ/)' },

  // H aspiré (comme "hâche" en français)
  { from: /\bh([aeiouAEIOU])/g, to: "h'$1", note: 'h aspiré' },
];

// ============================================================
// OVERRIDES PHONÉTIQUES MOT PAR MOT (côté client)
// ============================================================
const PHONETIC_OVERRIDES: Record<string, string> = {
  "mosi": "mochi",     // /ʃ/ comme « chat » en français
  "moshi": "mochi",    // graphie alternative — même prononciation /ʃ/
  "Moshi": "Mochi",
  "nkenke": "ntshntshe",
  "ngiena": "ndjena",
  "ngiele": "ndjele",
  "nkila": "ntshila",
  "tola": "tôla",
  "mama": "mâma",
  "sala": "sâla",
  "njijiri": "ndjîdjiri",
  "nzijiri": "ndjîdjiri",
  "nkumbu": "nkoumbou",
  "tshibuka": "tshibouka",
  "bilongo": "bilôngo",
  "mululu": "moulooulou",
  "mupepe": "moupépé",
  "nanguka": "nangouka",
  "ndendi": "ndéndi",
  "buzitu": "bouzitou",
  "tshivumu": "tshivoumou",
  "tshibuki": "tshibouki",
  "kinsangu": "kinsangou",
  "tshinkoso": "tshinkôsso",
  "saleno": "saléno",
  
  "tatika": "tatika",
  "yarika": "yarika",
  "lumfikini": "loumfikini",
  "mazono": "mazôno",
  "pi": "pii",
  "fyu": "fyuu",
  "nye": "nyee",
  "ti": "tii",
  "wa": "waa",
  "wuma": "ououma",     // /w/ comme "we" anglais, jamais /v/
  "nsi": "tsii",

  // Overrides phonétiques additionnels
  "ntu": "ntou",            // bloc unique /ntu/, ne pas séparer n+t
  "nse": "nsè",             // é ouvert sonore /nsɛ/
  "lulabu": "loulabou",     // /a/ très court, accent sur la
  "tshibanga": "tshiibanga",// /i:/ long
  "biyelo": "bi-yé-lo",     // syllabation forcée bi.ye.lo, jamais /bielo/
  "hembo": "h'embo",        // /h/ doux à la française
  "mahembo": "mah'embo",    // idem
  "ntu-": "ntou",           // garde-fou pour formes composées
  
  // Nouvelles formes corpus Mbuta Matondo — Overrides phonétiques
  "nzebia": "nzebia",        // liaison: ka nzebi a ko → prononcer /nzebia/ en un seul bloc
  "tuka": "touka",          // Kue wa tuka — /u/ prononcé ouvert
  "vukidi": "voukidî",      // survécu — accent final
  "vukiri": "voukiri",      // variante
  "saridi": "sâridî",       // opéré — accent sur le a et i final
  "washiri": "wâshirî",     // guéri — accent
  "nkia": "ntshia",         // Pourquoi — nki se prononce /ntshi/
  "buingi": "bouingui",     // beaucoup — /bu/ ouvert, /i/ final distinct
  "zololo": "zololo",       // apprécié — o ouvert
  "buabana": "bouaban'a",   // rencontrés (passé indéfini) — a final distinct
  "buabane": "bouabané",    // rencontrés (récent) — é final
  "kiari": "kiâri",         // triste — i et a longs
  "kieri": "kiéri",         // étais triste — é fermé
  "nzeri": "ndjéri",        // n'étais pas — nz → ndj, é ouvert /ɛ/
  "kweri": "kwéri",         // tu n'étais pas — é fermé
  "keri": "kéri",           // il/elle n'était pas — é fermé
  "tshari": "tshâri",       // triste (négation) — a ouvert

  // Nge / Ngie / Munienge — G dur /ŋɡ/ comme dans NGO
  "nge": "nghé",            // /ŋɡe/ — G dur, jamais /nʒe/
  "ngie": "ndjé",           // /ndje/ — affriquée prénasalisée /ndʒe/
  "nzeka": "ndjeka",        // /ndjeka/
  // Mbaji — /mbaʒi/ : "j" doux comme "Julien" en français (PAS /g/ dur).
  "mbaji": "mba-ji",
  // Bujitu — /buʒitu/
  "bujitu": "bou-ji-tou",
  "bujidi": "bou-ji-di",
  // Jimbakane — /ʒimbakane/
  "jimbakane": "ji-mbakane",
  "njimbakane": "n-ji-mbakane",
  // Djuna — /dzuna/ : affriquée /dz/ + "ou" français
  "djuna": "dzouna",
  "Djuna": "Dzouna",
  "djunidi": "dzounidi",
  "djunini": "dzounini",
  // Djunu (la paix) — /dzunu/
  "djunu": "dzounou",
  "Djunu": "Dzounou",
  // Nkima — /ntʃima/ : un singe.
  "nkima": "ntshima",
  "Nkima": "Ntshima",
  "munienge": "mounienghé", // /muniɛŋɡe/ — G dur sur la finale
  "munienghe": "mounienghé",// variante orthographique
  // Mungua — /muⁿɡwa/
  "mungua": "moungoua",
  "munguani": "moungouani",
  "fuka": "pfouka",         // infinitif /pfuka/
  "meso": "messo",          // /s/ sourd intervocalique
  "honda": "honnda",        // /h/ aspiré + /nd/ net
  "mfuka": "mfouka",        // dette
  "mfuba": "mfouba",        // verte, pas mûre
  "buaka": "bouaka",        // mûre
  "nkatika": "nkatika",     // vraiment
  "manga": "manga",         // mangue — g dur déjà géré par cluster
  "mangulu": "mangoulou",
  "matatshebo": "matatshébo",
  "bimfimfiya": "bimfimfiya",
  "mawa": "mawa",
  "mamonso": "mamônsso",
  "tuila": "touila",
  "butisa": "boutissa",
  "dingi": "dîngui",        // g dur final
  "nkombo": "nkômbo",
  "longoka": "longôka",
  // (zololo déjà défini plus haut)
  "nlongi": "nlôngui",      // g dur
  "batika": "batika",
  "batikiri": "batikiri",
  "he": "héééééé",         // interjection /heee/ très long
  // Shama / Shemi — /ʃ/ comme "chat" en français (PAS /tʃ/ anglais).
  "shama": "chama",        // /ʃama/ — infinitif "aller"
  "shemi": "chémi",        // /ʃɛmi/ — "je vais"

  // Zaba — premier /a/ long : /zaːba/
  "zaba": "zââba",
  "Zaba": "Zââba",

  // Nsoneka (= écrire) : s'écrit nsoneka, se prononce /tsoneka/
  "nsoneka": "tsonéka",
  "Nsoneka": "Tsonéka",
}

/**
 * Liaisons obligatoires (à appliquer AVANT les overrides de mots,
 * sinon "nkumbu" est remplacé en isolation et la liaison est perdue).
 */
const LIAISONS: Array<[RegExp, string]> = [
  [/\bnkumbu\s+ani\b/gi, 'nkoumbouani'],
  [/\bnkumbu\s+andi\b/gi, 'nkoumbouandi'],
  [/\bnkumbu\s+aku\b/gi, 'nkoumbouaku'],
  // Pauses obligatoires pour la compréhension
  [/\bbue\s+ta\s+kue\s+nduku\s+(ani|aku|andi)\b/gi, 'Bue. Ta. Kue. Nduku $1'],
  [/\bbue\s+ta\b(?!\s*[,.])/gi, 'Bue. Ta,'],
];

/**
 * Applique les règles de prononciation pour ElevenLabs.
 */
export function preprocessForElevenLabs(text: string): string {
  // Step 0: liaisons obligatoires (avant tout)
  let result = text;
  for (const [re, to] of LIAISONS) result = result.replace(re, to);
  // Step 1: word-level overrides
  result = result.replace(/\b[\w']+\b/g, (word) => {
    const lower = word.toLowerCase();
    return PHONETIC_OVERRIDES[lower] || word;
  });
  // Step 2: regex rules
  for (const rule of ELEVENLABS_RULES) {
    result = result.replace(rule.from, rule.to);
  }
  return result;
}

// ============================================================
// PRÉTRAITEMENT POUR LA POLICE MANDOMBE
// ============================================================

/**
 * Prépare le texte pour l'affichage avec la police Mandombe.
 * nj → n + ZWJ + dj (sépare le nasal de l'affriquée)
 */
export function preprocessForMandombe(text: string): string {
  let result = text;

  // nj → n + ZWJ + dj
  result = result.replace(/nj([aeiouAEIOU])/g, 'n\u200Ddj$1');

  // Ponctuation Mandombe (espaces requis pour les ligatures)
  result = result.replace(/\./g, ' . ');
  result = result.replace(/,/g, ' , ');
  result = result.replace(/\?/g, ' ? ');
  result = result.replace(/!/g, ' ! ');
  result = result.replace(/;/g, ' ; ');
  result = result.replace(/:/g, ' : ');

  // Nettoyer espaces multiples
  result = result.replace(/ +/g, ' ').trim();

  return result;
}

// ============================================================
// FONCTION PRINCIPALE
// ============================================================

export interface LariTextResult {
  display: string;
  tts: string;
  mandombe: string;
  syllables: string[][];
}

/**
 * Traite un texte lari pour toutes les sorties simultanément.
 */
export function processLariText(text: string): LariTextResult {
  const words = text.trim().split(/\s+/);
  return {
    display: text,
    tts: preprocessForElevenLabs(text),
    mandombe: preprocessForMandombe(text),
    syllables: words.map(w => syllabify(w)),
  };
}
