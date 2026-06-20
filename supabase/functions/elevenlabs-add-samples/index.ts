import { requireAuth, unauthorizedResponse } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const auth = await requireAuth(req, { requireAdmin: true });
  if (!auth.ok) return unauthorizedResponse(auth, corsHeaders);

  try {
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_VOICES_KEY") || Deno.env.get("ELEVENLABS_API_KEY");
    if (!ELEVENLABS_API_KEY) {
      throw new Error("ELEVENLABS_VOICES_KEY / ELEVENLABS_API_KEY is not configured");
    }

    const formData = await req.formData();
    
    const voiceId = formData.get("voice_id")?.toString() || "Gz9w9RNGNUZjVYbvzXY7";
    const name = formData.get("name")?.toString() || "Lari Native Speaker";

    // First, get existing voice info to preserve settings
    const infoRes = await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, {
      headers: { "xi-api-key": ELEVENLABS_API_KEY },
    });
    const voiceInfo = await infoRes.json();
    console.log("Current voice info:", voiceInfo.name, "samples:", voiceInfo.samples?.length || 0);

    // Build multipart form for edit endpoint
    const apiFormData = new FormData();
    apiFormData.append("name", voiceInfo.name || name);
    if (voiceInfo.description) {
      apiFormData.append("description", voiceInfo.description);
    }

    let fileCount = 0;
    for (const [key, value] of formData.entries()) {
      if (key.startsWith("file") && value instanceof File) {
        apiFormData.append("files", value, value.name);
        fileCount++;
      }
    }

    if (fileCount === 0) {
      return new Response(
        JSON.stringify({ error: "No audio files provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Adding ${fileCount} samples to voice ${voiceId}...`);

    const response = await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}/edit`, {
      method: "POST",
      headers: { "xi-api-key": ELEVENLABS_API_KEY },
      body: apiFormData,
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("ElevenLabs edit error:", JSON.stringify(data));
      return new Response(
        JSON.stringify({ error: "Voice edit failed", details: data }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Samples added successfully!");

    return new Response(
      JSON.stringify({ success: true, voice_id: voiceId, samples_added: fileCount }),
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
