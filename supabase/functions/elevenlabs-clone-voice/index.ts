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
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    if (!ELEVENLABS_API_KEY) {
      throw new Error("ELEVENLABS_API_KEY is not configured");
    }

    // Accept multipart form data with audio files
    const formData = await req.formData();
    
    // Build the request to ElevenLabs
    const apiFormData = new FormData();
    apiFormData.append("name", "Lari Native Speaker");
    apiFormData.append("description", "Kikongo Lari native speaker voice for language learning");

    // Collect all audio files from the request
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

    console.log(`Cloning voice with ${fileCount} audio samples...`);

    const response = await fetch("https://api.elevenlabs.io/v1/voices/add", {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
      },
      body: apiFormData,
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("ElevenLabs clone error:", JSON.stringify(data));
      return new Response(
        JSON.stringify({ error: "Voice cloning failed", details: data }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Voice cloned successfully! voice_id:", data.voice_id);

    return new Response(
      JSON.stringify({ voice_id: data.voice_id, name: "Lari Native Speaker" }),
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
