import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { requireAuth, unauthorizedResponse } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FRENCH_VOICE_ID = "R89ZQJowZAEgiPNyC3dQ";
const MBILIA_VOICE_ID = "9d5gN66gJ67fuz9yl7IQ";
const KOREAN_VOICE_ID = "KlstlYt9VVf3zgie2Oht";
const MAX_TTS_CHARS = 1000;

const langMapping: Record<string, string> = {
  fr: "fr", en: "en", pt: "pt", es: "es", it: "it", el: "el", ko: "ko",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const auth = await requireAuth(req);
  if (!auth.ok) return unauthorizedResponse(auth, corsHeaders);

  try {
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    if (!ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY is not configured");

    const { text, lang } = await req.json();
    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "text is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (text.length > MAX_TTS_CHARS) {
      return new Response(JSON.stringify({ error: `text exceeds ${MAX_TTS_CHARS} characters` }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Préserver "?" et "!" pour la prosodie ; ajouter "?" si question détectée sans ponctuation finale.
    let speechText = String(text).trim();
    if (speechText && !/[?!.]$/.test(speechText)) {
      const isQuestion = /\b(qui|que|quoi|comment|pourquoi|où|quand|combien|est-ce|what|who|why|how|where|when|which|nani|bue|kue|nki)\b/i.test(speechText);
      if (isQuestion) speechText += " ?";
    }

    const isLingala = lang === "ln";
    const isKorean = lang === "ko";
    const voiceId = isLingala ? MBILIA_VOICE_ID : isKorean ? KOREAN_VOICE_ID : FRENCH_VOICE_ID;
    const modelId = isLingala ? "eleven_v3" : "eleven_multilingual_v2";

    console.log(`TTS: "${text.substring(0, 60)}" | lang: ${lang} | model: ${modelId} | voice: ${isLingala ? "Mbilia" : isKorean ? "Korean" : "French"}`);

    const body: Record<string, unknown> = {
      text: speechText,
      model_id: modelId,
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true },
    };

    // For non-Lingala, pass explicit language_code; for Lingala on v3, let it auto-detect
    if (!isLingala) {
      body.language_code = langMapping[lang] || "en";
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_22050_32`,
      {
        method: "POST",
        headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error("ElevenLabs TTS error:", errorData);
      return new Response(JSON.stringify({ error: "TTS generation failed", details: errorData }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const audioBuffer = await response.arrayBuffer();
    const base64Audio = base64Encode(audioBuffer);

    return new Response(JSON.stringify({ audioContent: base64Audio }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
