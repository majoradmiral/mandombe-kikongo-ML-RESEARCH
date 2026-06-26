import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { requireAuth, unauthorizedResponse } from "../_shared/auth.ts";

const MAX_TTS_CHARS = 1000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_VOICE_ID = (Deno.env.get("LARI_VOICE_ID") || "").trim() || "Gz9w9RNGNUZjVYbvzXY7";

// ============================================================
// OVERRIDES PHONÉTIQUES MOT PAR MOT
// Pour les mots avec indications phonétiques spécifiques
// (voyelles longues, accents, prononciations particulières)
// ============================================================

const PHONETIC_OVERRIDES: Record<string, string> = {
  // moshi — "sh" = /ʃ/ comme "shoes" en anglais / "chat" en français.
  // ⚠️ NE PAS laisser le mot devenir "mochi" : ElevenLabs (v3 et multilingual)
  // reconnaît "mochi" comme le mot japonais et le prononce /motʃi/.
  // On force une graphie française unique ("mau-chi") qui garantit /moʃi/.
  "mosi": "mau-chi",
  "Mosi": "Mau-chi",
  "moshi": "mau-chi",
  "Moshi": "Mau-chi",
  // Zaba — premier /a/ long /zaːba/
  "zaba": "zââba",
  "Zaba": "Zââba",
  // Nsoneka (écrire) — s'écrit nsoneka, prononcé /tsoneka/
  "nsoneka": "tsonéka",
  "Nsoneka": "Tsonéka",
  "ntinu": "ntînou",
  "djoka": "djôka",
  "zeba": "zéba",
  "bandumuna": "bandoumouna",
  "balumuna": "baloumouna",
  "vikuna": "vikouna",
  "nsaki": "nsakhi",
  "ntshangu": "ntchangou",
  "ngueyi": "ngéyi",
  "weyi": "wéyi",
  "buishi": "bouishi",
  "fioti": "fioti",
  "kani": "kâni",
  "matanga": "matanga",
  "malaki": "malakhi",
  "jimbakane": "jimbakané",
  // Mazuji — finale /ʒi/ (jamais /dzi/). "zou" force /zu/ français,
  // tiret avant "ji" déclenche la règle /ʒ/ ("Julien"), comme bujitu/mbaji.
  "mazuji": "ma-zou-ji",
  "Mazuji": "Ma-zou-ji",
  "mbakisa": "mbakissa",
  "lusalusu": "loussaloussou",
  "lubakusu": "loubakoussou",
  "sukula": "soukoula",
  "nsadisi": "nsadissi",
  "mankondi": "mankôndi",
  "ndambu": "ndambou",
  // ---- Nouveaux overrides (corpus étendu) ----
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
  "nsi": "tsii",
  "nkia": "ntshia",
  // Nge — G dur. ATTENTION : "ngie" → /ndje/ UNIQUEMENT dans ngiena/ngiele
  // (gérés via les overrides word-level). Pas de règle générale "ngie → ndje".
  "nge": "nghé",
  "nzeka": "ndjeka",        // /ndjeka/
  // Mbaji — /mbaʒi/ : "j" doux comme "Julien" en français.
  // Tiret pour forcer la syllabation et garantir /ʒ/ (sinon ElevenLabs lit /y/).
  "mbaji": "mba-ji",
  // Bujitu — /buʒitu/ : "j" doux français ("Julien"). Tirets pour casser
  // toute lecture en semi-voyelle /y/ et garantir /ʒ/.
  "bujitu": "bou-ji-tou",
  "bujidi": "bou-ji-di",
  // Jimbakane — /ʒimbakane/ : "j" doux français ("Julien"), PAS /dʒ/.
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
  // Nkima — /ntʃima/ "un singe" : cluster prénasalisé + /tʃ/ comme "tch".
  "nkima": "ntshima",
  "Nkima": "Ntshima",
  // Mungua — /muⁿɡwa/
  "mungua": "moungoua",
  "munguani": "moungouani",
  // Interjection "he" (oui kongo) — h très doux (quasi muet),
  // modulation : voix qui monte (è→é) puis redescend (é→è).
  // Virgules = courbe prosodique ; pas de "h" dur en attaque.
  "he": "èéé,èè",
  "He": "èéé,èè",
  "HE": "èéé,èè",
  // Wuma — /w/ comme dans "we" anglais, JAMAIS /v/
  "wuma": "ououma",
  // Nzomikanda / kanda — éviter la nasale française /ɑ̃/ dans "an".
  // On force la séparation a + n + da via un trait d'union phonétique ("ka-nda").
  // En français, "a-n" en début de syllabe distincte se prononce /a.n/, pas /ɑ̃/.
  "nzomikanda": "nzomika'nda",
  "kanda": "ka'nda",
  "nkanda": "nka'nda",
  "mikanda": "mika'nda",
  // Shama / Shemi — /ʃ/ comme "chat" en français, JAMAIS /tʃ/ anglais.
  // En français, "ch" + voyelle = /ʃ/ garanti. La graphie reste "sh" en Lari
  // mais le moteur lit "ch" pour forcer la fricative palato-alveolaire sourde.
  "shama": "chama",          // /ʃama/ — infinitif "aller"
  "shemi": "chémi",          // /ʃɛmi/ — "je vais"
};

// ============================================================
// RÈGLES PHONÉTIQUES POUR ELEVEN LABS (moteur v2)
// Basé sur : Jacquot (1971/1982) + analyse acoustique Denis Malanda
// ============================================================

interface PhoneticRule {
  from: RegExp;
  to: string;
}

const ELEVENLABS_RULES: PhoneticRule[] = [
  // ŋ vélaire (n') + k
  { from: /n'ki/g, to: 'nkhi' },
  { from: /n'ke/g, to: 'nkhe' },
  { from: /n'k([aouAOU])/g, to: 'nk$1' },

  // ŋ vélaire (n') + g
  { from: /n'g([iIeE])/g, to: 'ngh$1' },
  { from: /n'g([aouAOU])/g, to: 'ng$1' },

  // ŋ + other consonants
  { from: /n's([aeiouAEIOU])/g, to: 'nhs$1' },
  { from: /n'z([aeiouAEIOU])/g, to: 'nhz$1' },
  { from: /n't([iI])/g, to: 'nhti' },
  { from: /n'v([aeiouAEIOU])/g, to: 'nhv$1' },
  { from: /n'd([iI])/g, to: 'nhdi' },

  // nj → ndj (affriquée prénasalisée) — specific words first
  { from: /mpangi/g, to: 'mpan-ghi' },

  // « zingi » et famille — G dur explicite (sinon ElevenLabs palatalise après /zi/)
  { from: /\bbizingi\b/gi, to: 'bi-zin-ghi' },
  { from: /\bnzingi\b/gi, to: 'nzin-ghi' },
  { from: /\bzingi\b/gi, to: 'zin-ghi' },
  { from: /nj([aeiouAEIOU])/g, to: 'ndj$1' },

  // /ʒ/ français ("Julien") pour j + voyelle isolé en lari.
  // ElevenLabs (FR) lit parfois "ji" comme semi-voyelle /y/. On insère un tiret
  // avant ji/ju isolés (ni d, ni n devant) pour forcer la syllabation et
  // garantir la fricative palato-alvéolaire voisée /ʒ/.
  { from: /([^dnDN])ji/g, to: '$1-ji' },
  { from: /([^dnDN])ju/g, to: '$1-jou' },
  { from: /\bji/g, to: 'ji' },
  { from: /\bju/g, to: 'jou' },

  // G dur (ŋɡ) systématique pour TOUTE la série Ng — corrige la mauvaise prononciation
  // d'ElevenLabs qui palatalisait nge/ngi en /ɲe/ /ɲi/.
  // En orthographe française, "gh" + voyelle = G dur garanti.
  { from: /ngi/g, to: 'nghi' },
  { from: /nge/g, to: 'nghe' },
  { from: /nga/g, to: 'ngha' },
  { from: /ngo/g, to: 'ngho' },
  { from: /ngu/g, to: 'nghu' },
  { from: /\bgi/g, to: 'guî' },
  { from: /\bge/g, to: 'guê' },

  // nguri ya → bloc unique
  { from: /nguri ya/g, to: 'nguria' },

  // /w/ TOUJOURS comme dans "win/we" (anglais), JAMAIS /v/ — on force la voyelle "ou"
  { from: /\bwa/gi, to: 'oua' },
  { from: /\bwe/gi, to: 'ouè' },
  { from: /\bwi/gi, to: 'oui' },
  { from: /\bwo/gi, to: 'ouo' },
  { from: /\bwu/gi, to: 'ouou' },
  { from: /([aeiou])wa/gi, to: '$1oua' },
  { from: /([aeiou])we/gi, to: '$1ouè' },
  { from: /([aeiou])wi/gi, to: '$1oui' },
  { from: /([aeiou])wo/gi, to: '$1ouo' },
  { from: /([aeiou])wu/gi, to: '$1ouou' },

  // /s/ TOUJOURS sourd, JAMAIS voisé /z/ — double le s entre voyelles
  { from: /([aeiouéèêà])s([aeiouéèêà])/gi, to: '$1ss$2' },

  // Sh + voyelle → /ʃ/ (fricative palato-alvéolaire sourde, comme "chat" en français).
  // ElevenLabs en mode FR lit parfois "sh" comme /tʃ/ (anglais) ; on remappe vers "ch"
  // qui en orthographe française garantit /ʃ/. Ne PAS toucher au cluster "tsh" (= /tʃ/ voulu).
  // S'applique aux verbes "shama" (aller), "shemi" (je vais) et formes dérivées.
  { from: /(^|[^t])sh([aeiouAEIOU])/g, to: '$1ch$2' },

  // H aspiré (comme "hâche" en français) — hi/hu/he/ho/ha
  // ElevenLabs prononce déjà 'h' aspiré en mode FR ; on garantit qu'il n'est pas muet
  // en doublant le contexte vocalique.
  { from: /\bh([aeiouAEIOU])/g, to: "h'$1" },

  // ====== DÉSANASALISATION ======
  // Le kikongo n'a JAMAIS de voyelles nasales françaises (/ɑ̃/ /ɛ̃/ /ɔ̃/ /œ̃/).
  // ElevenLabs (moteur FR) tend à lire "an/en/in/on/un" + consonne comme nasale.
  // On insère une apostrophe pour forcer la syllabation V.N+C : a-nda, e-nde, i-nki...
  // Important : NE PAS toucher aux digrammes prénasalisés initiaux (mb, nd, ng, nk, ns, nz, nt, nj)
  // déjà gérés ci-dessus. Ici on cible uniquement V + n + consonne où V ∈ {a,e,i,o,u}.
  { from: /([aeiou])n([bcdfgjklmpqrstvwxz])/gi, to: "$1'n$2" },
];

// ============================================================
// TABLE IPA (référence — appliquée via overrides Latin->FR plutôt
// que SSML, car eleven_v3 ne supporte pas <phoneme>).
// Conservée ici pour documentation.
// ngi/nge/nga/ngo/ngu → ŋɡi ŋɡe ŋɡa ŋɡo ŋɡu
// gi/ge → ɡi ɡe (G dur)
// shi/she/sha/sho/shu → ʃi ʃe ʃa ʃo ʃu
// ji/je/ja/jo/ju → ʒi ʒe ʒa ʒo ʒu (fricative seule)
// nji/nje/nja/njo/nju → ndʒi ndʒe ndʒa ndʒo ndʒu (affriquée prénasalisée)
// ri/re/ra/ro/ru → ɾi ɾe ɾa ɾo ɾu (battement)
// nyi/nye/nya/nyo/nyu → ɲi ɲe ɲa ɲo ɲu
// hi/he/ha/ho/hu → h aspiré (français hâche)
// n'k... → coup de glotte vélaire
// ============================================================

/**
 * Liaisons obligatoires (avant les overrides mot-par-mot).
 */
const LIAISONS: Array<[RegExp, string]> = [
  [/\bnkumbu\s+ani\b/gi, 'nkoumbouani'],
  [/\bnkumbu\s+andi\b/gi, 'nkoumbouandi'],
  [/\bnkumbu\s+aku\b/gi, 'nkoumbouaku'],
  // Pauses obligatoires pour la compréhension par les locuteurs natifs
  // "Bue ta kue nduku X" → segmenté avec virgules/points
  [/\bbue\s+ta\s+kue\s+nduku\s+(ani|aku|andi)\b/gi, 'Bue. Ta. Kue. Nduku $1'],
  // "Bue ta <verbe>" → pause après "ta"
  [/\bbue\s+ta\b(?!\s*[,.])/gi, 'Bue. Ta,'],
];

/**
 * Apply liaisons, phonetic overrides, then regex rules.
 */
function preprocessForElevenLabs(text: string): string {
  // Step 0: liaisons
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Cross-project service token bypass (for pre-generating MP3 caches from other Lovable projects).
  // The token is a server-side secret rotated/revoked from the dashboard — invalidate by deleting/rotating TTS_SERVICE_TOKEN.
  const serviceToken = req.headers.get("x-service-token") || req.headers.get("X-Service-Token");
  const expectedServiceToken = Deno.env.get("TTS_SERVICE_TOKEN");
  const isServiceCall = !!serviceToken && !!expectedServiceToken && serviceToken === expectedServiceToken;

  if (!isServiceCall) {
    const auth = await requireAuth(req);
    if (!auth.ok) return unauthorizedResponse(auth, corsHeaders);
  }

  try {
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    if (!ELEVENLABS_API_KEY) {
      throw new Error("ELEVENLABS_API_KEY is not configured");
    }

    const { text, voiceId } = await req.json();

    if (!text || typeof text !== "string") {
      return new Response(
        JSON.stringify({ error: "text is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (text.length > MAX_TTS_CHARS) {
      return new Response(
        JSON.stringify({ error: `text exceeds ${MAX_TTS_CHARS} characters` }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const selectedVoice = voiceId || DEFAULT_VOICE_ID;
    const processedText = preprocessForElevenLabs(text);
    // Strip non-speech characters but PRESERVE "?" and "!" for prosody
    // (question mark = montée d'intonation finale, exclamation = emphase).
    let cleanedText = processedText.replace(/[\[\]{}()<>]/g, '').trim();
    // Si la phrase ressemble à une question (mots interrogatifs Lari/FR) et n'a pas de "?",
    // en ajouter un pour forcer la montée intonative finale.
    if (cleanedText && !/[?!.]$/.test(cleanedText)) {
      const isQuestion = /\b(bue|nani|kue|nki|kani|inki|nkia|que|qui|comment|pourquoi|où|quand|combien|est-ce|quoi)\b/i.test(cleanedText);
      if (isQuestion) cleanedText += ' ?';
    }
    if (!cleanedText) {
      return new Response(
        JSON.stringify({ error: "Text contains no speakable content" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    console.log(`TTS Lari: "${text}" → processed: "${cleanedText}" | voice: ${selectedVoice}`);

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoice}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: cleanedText,
          model_id: "eleven_v3",
          language_code: "fr",
          voice_settings: {
            stability: 0.72,
            similarity_boost: 0.75,
            style: 0.10,
            use_speaker_boost: false,
            speed: 0.85,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error("ElevenLabs TTS error:", errorData);

      // Detect quota_exceeded (ElevenLabs returns 401 with status "quota_exceeded")
      const isQuotaExceeded =
        /quota_exceeded|quota exceeded|insufficient.*credit|out of credits/i.test(errorData);
      if (isQuotaExceeded) {
        return new Response(
          JSON.stringify({ error: "quota_exceeded", provider: "elevenlabs", details: errorData }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (response.status === 422 || response.status === 403) {
        console.log("Falling back to eleven_multilingual_v2...");
        const fallbackResponse = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoice}?output_format=mp3_44100_128`,
          {
            method: "POST",
            headers: {
              "xi-api-key": ELEVENLABS_API_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              text: cleanedText,
              model_id: "eleven_multilingual_v2",
              voice_settings: {
                stability: 0.72,
                similarity_boost: 0.75,
                style: 0.10,
                use_speaker_boost: false,
                speed: 0.85,
              },
            }),
          }
        );

        if (!fallbackResponse.ok) {
          const fallbackError = await fallbackResponse.text();
          console.error("Fallback TTS error:", fallbackError);
          const fbQuota = /quota_exceeded|quota exceeded|insufficient.*credit|out of credits/i.test(fallbackError);
          return new Response(
            JSON.stringify({ error: fbQuota ? "quota_exceeded" : "TTS generation failed", details: fallbackError }),
            { status: fbQuota ? 402 : fallbackResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const fallbackBuffer = await fallbackResponse.arrayBuffer();
        const fallbackBase64 = base64Encode(fallbackBuffer);
        return new Response(
          JSON.stringify({ audioContent: fallbackBase64, model: "eleven_multilingual_v2" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "TTS generation failed", details: errorData }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const audioBuffer = await response.arrayBuffer();
    const base64Audio = base64Encode(audioBuffer);

    return new Response(
      JSON.stringify({ audioContent: base64Audio, model: "eleven_v3" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
