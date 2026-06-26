// tts-lari-cached
// Cache permanent des MP3 Lari dans le bucket public `public-assets/tts-cache/lari/`.
// 1. Hash stable du couple (texte normalisé, voiceId) -> nom de fichier.
// 2. Si l'objet existe déjà -> on renvoie l'URL publique (0 crédit ElevenLabs).
// 3. Sinon, on appelle `elevenlabs-tts-lari` (via service token), on uploade le MP3,
//    on renvoie l'URL publique. Une seule génération à vie par texte+voix.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { decode as base64Decode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { requireAuth, unauthorizedResponse } from "../_shared/auth.ts";

const BUCKET = "public-assets";
const PREFIX = "tts-cache/lari";
const MAX_CHARS = 1000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-service-token",
};

function normalize(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

// Module-level quota memory: once ElevenLabs returns quota_exceeded, skip it
// entirely for QUOTA_TTL_MS to avoid burning further requests/credits.
const QUOTA_TTL_MS = 30 * 60 * 1000; // 30 min
let elevenQuotaExhaustedUntil = 0;

async function lovableAiFallback(text: string): Promise<Uint8Array | null> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return null;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini-tts",
        input: text,
        voice: "alloy",
        response_format: "mp3",
      }),
    });
    if (!res.ok) {
      console.error("Lovable AI fallback failed:", res.status, await res.text().catch(() => ""));
      return null;
    }
    return new Uint8Array(await res.arrayBuffer());
  } catch (e) {
    console.error("Lovable AI fallback error:", e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Allow either signed-in user OR cross-project service token
  const serviceToken = req.headers.get("x-service-token");
  const expectedServiceToken = Deno.env.get("TTS_SERVICE_TOKEN");
  const isServiceCall = !!serviceToken && !!expectedServiceToken && serviceToken === expectedServiceToken;

  if (!isServiceCall) {
    const auth = await requireAuth(req);
    if (!auth.ok) return unauthorizedResponse(auth, corsHeaders);
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SERVICE_TOKEN = Deno.env.get("TTS_SERVICE_TOKEN")!;

    const body = await req.json().catch(() => ({}));
    const text: string = body?.text ?? "";
    const voiceId: string | undefined = body?.voiceId;

    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "text is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (text.length > MAX_CHARS) {
      return new Response(JSON.stringify({ error: `text exceeds ${MAX_CHARS} chars` }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const norm = normalize(text);
    const voiceKey = (voiceId || "default").trim();
    const hash = (await sha256Hex(`${voiceKey}::${norm}`)).slice(0, 16);
    const slug = slugify(norm) || "audio";
    const objectPath = `${PREFIX}/${slug}-${hash}.mp3`;
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${objectPath}`;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 1. Cache HIT? -> HEAD via public URL (fast, no listing perms needed)
    const head = await fetch(publicUrl, { method: "HEAD" });
    if (head.ok) {
      return new Response(JSON.stringify({ url: publicUrl, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Cache MISS -> try ElevenLabs (unless quota recently exhausted), else Lovable AI fallback
    let audioBytes: Uint8Array | null = null;
    let usedFallback = false;
    const quotaActive = Date.now() < elevenQuotaExhaustedUntil;

    if (!quotaActive) {
      const ttsRes = await fetch(`${SUPABASE_URL}/functions/v1/elevenlabs-tts-lari`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-service-token": SERVICE_TOKEN,
        },
        body: JSON.stringify({ text, voiceId }),
      });

      if (ttsRes.ok) {
        const { audioContent } = await ttsRes.json();
        if (audioContent) audioBytes = base64Decode(audioContent);
      } else {
        const detail = await ttsRes.text().catch(() => "");
        const isQuota = ttsRes.status === 402 || /quota_exceeded/i.test(detail);
        if (isQuota) {
          console.warn("ElevenLabs quota exhausted — switching to Lovable AI fallback for 30 min");
          elevenQuotaExhaustedUntil = Date.now() + QUOTA_TTL_MS;
        } else {
          console.error("Upstream TTS failed:", ttsRes.status, detail);
        }
      }
    } else {
      console.log("Skipping ElevenLabs (quota cooldown active)");
    }

    if (!audioBytes) {
      const fb = await lovableAiFallback(text);
      if (fb) {
        audioBytes = fb;
        usedFallback = true;
      }
    }

    if (!audioBytes) {
      return new Response(
        JSON.stringify({
          error: "tts_unavailable",
          message: "ElevenLabs quota exceeded and no fallback available.",
          quotaExceeded: true,
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }


    // 3. Upload to public bucket
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(objectPath, audioBytes, {
        contentType: "audio/mpeg",
        cacheControl: "31536000, immutable",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      // Even if upload fails, return base64 so playback still works.
      return new Response(
        JSON.stringify({
          url: null,
          cached: false,
          audioContent,
          uploadError: uploadError.message,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`TTS cached: ${objectPath}`);
    return new Response(JSON.stringify({ url: publicUrl, cached: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("tts-lari-cached error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
