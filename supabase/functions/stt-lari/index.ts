// Speech-to-text for Kikongo Lari via Lovable AI Gateway (OpenAI gpt-4o-mini-transcribe).
// - No ElevenLabs credit consumption.
// - Two modes:
//   1. Dictation: returns { text } — used to fill chat input.
//   2. Pronunciation check: client passes `expected` (the Lari word/phrase the
//      user was supposed to say). We transcribe, normalize, compute a similarity
//      score (Levenshtein-based) and return a verdict + colored feedback.
import { requireAuth, unauthorizedResponse } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_BYTES = 8 * 1024 * 1024; // 8 MiB

// --- Normalisation Lari ----------------------------------------------------
// Compare en ignorant: casse, accents, ponctuation, doubles voyelles.
function normalizeLari(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")        // remove diacritics
    .replace(/[^\p{L}\p{N}\s']/gu, " ")     // strip punctuation
    .replace(/'/g, "")                      // ignore apostrophes
    .replace(/(.)\1+/g, "$1")               // collapse doubled letters
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const v0 = new Array(b.length + 1);
  const v1 = new Array(b.length + 1);
  for (let i = 0; i <= b.length; i++) v0[i] = i;
  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j];
  }
  return v1[b.length];
}

function similarity(a: string, b: string): number {
  const na = normalizeLari(a);
  const nb = normalizeLari(b);
  if (!na && !nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  if (!maxLen) return 1;
  return 1 - levenshtein(na, nb) / maxLen;
}

function verdictOf(score: number): "excellent" | "good" | "retry" {
  if (score >= 0.85) return "excellent";
  if (score >= 0.6) return "good";
  return "retry";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = await requireAuth(req);
  if (!auth.ok) return unauthorizedResponse(auth, corsHeaders);

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const inFd = await req.formData();
    const audio = inFd.get("audio");
    const expected = (inFd.get("expected") as string | null) || "";

    if (!(audio instanceof Blob)) {
      return new Response(JSON.stringify({ error: "audio file is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (audio.size === 0 || audio.size > MAX_BYTES) {
      return new Response(JSON.stringify({ error: "audio empty or too large" }), {
        status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Forward to Lovable AI Gateway
    const upType = (audio.type || "audio/webm").split(";")[0];
    const extMap: Record<string, string> = {
      "audio/webm": "webm", "audio/mp4": "mp4", "audio/mpeg": "mp3",
      "audio/wav": "wav", "audio/wave": "wav", "audio/ogg": "ogg",
    };
    const ext = extMap[upType] ?? "webm";

    const upstream = new FormData();
    upstream.append("model", "openai/gpt-4o-mini-transcribe");
    upstream.append("file", audio, `recording.${ext}`);
    // No `language` — Lari is not in the ISO list, autodetect → French/Bantu mix.
    // The `prompt` field biases the model toward Lari spelling.
    const prompt = expected
      ? `Kikongo Lari. The speaker should say: "${expected}". Transcribe exactly what they actually said, in Latin orthography, keeping double consonants like nk, mb, nz, ts, sh.`
      : `Kikongo Lari spoken in Brazzaville. Transcribe in Latin orthography (no Mandombe). Common clusters: mp, mb, nd, nt, nk, ng, nz, ns, ts, tsh, sh.`;
    upstream.append("prompt", prompt);

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: upstream,
    });

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => "");
      console.error("AI Gateway STT error", resp.status, errBody);
      return new Response(
        JSON.stringify({ error: "transcription_failed", status: resp.status, details: errBody.slice(0, 500) }),
        { status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await resp.json();
    const text: string = (data.text || "").trim();

    if (!expected) {
      return new Response(JSON.stringify({ text }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const score = similarity(text, expected);
    return new Response(JSON.stringify({
      text,
      expected,
      score,
      verdict: verdictOf(score),
      normalized: { heard: normalizeLari(text), expected: normalizeLari(expected) },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("stt-lari error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
