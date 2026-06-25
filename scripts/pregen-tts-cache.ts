/**
 * Pré-génération batch du cache TTS Lari.
 *
 * Parcourt `supabase/functions/_shared/dictionary.json` (et optionnellement
 * d'autres sources) et appelle l'edge function `tts-lari-cached` pour chaque
 * lemme unique. Les cache hits sont gratuits (HEAD sur le bucket) ; seules
 * les entrées manquantes consomment des crédits ElevenLabs.
 *
 * Usage :
 *   SUPABASE_URL=... TTS_SERVICE_TOKEN=... bun run scripts/pregen-tts-cache.ts
 *
 * Options (variables d'env) :
 *   LIMIT=50            n'envoie que les 50 premiers (test)
 *   CONCURRENCY=3       requêtes parallèles (défaut 3)
 *   DELAY_MS=250        pause entre vagues (défaut 250 ms)
 *   START=0             reprise (skip les N premiers)
 *   SOURCES=dict,lessons,mbuta   sources à inclure (défaut: dict)
 */

import dictionary from "../supabase/functions/_shared/dictionary.json" with { type: "json" };
import mbutaCorpus from "../supabase/functions/_shared/mbuta-corpus-v2.json" with { type: "json" };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_TOKEN = process.env.TTS_SERVICE_TOKEN;

if (!SUPABASE_URL || !SERVICE_TOKEN) {
  console.error("ERROR: set SUPABASE_URL and TTS_SERVICE_TOKEN env vars.");
  process.exit(1);
}

const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : Infinity;
const CONCURRENCY = process.env.CONCURRENCY ? parseInt(process.env.CONCURRENCY, 10) : 3;
const DELAY_MS = process.env.DELAY_MS ? parseInt(process.env.DELAY_MS, 10) : 250;
const START = process.env.START ? parseInt(process.env.START, 10) : 0;
const SOURCES = (process.env.SOURCES || "dict").split(",").map((s) => s.trim());

const ENDPOINT = `${SUPABASE_URL}/functions/v1/tts-lari-cached`;

function normalize(s: string): string {
  return s.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}

// ---------- Collect candidate Lari lemmas ----------
const seen = new Set<string>();
const words: string[] = [];

function addWord(raw: unknown) {
  if (typeof raw !== "string") return;
  const w = raw.trim();
  if (!w) return;
  // Skip very long phrases (waste of credits) and obvious non-Lari.
  if (w.length > 60) return;
  if (!/^[\p{L}\p{M}\s'’\-]+$/u.test(w)) return;
  const key = normalize(w);
  if (seen.has(key)) return;
  seen.add(key);
  words.push(w);
}

if (SOURCES.includes("dict")) {
  for (const e of dictionary as Array<{ lari?: string }>) addWord(e.lari);
}

if (SOURCES.includes("mbuta")) {
  for (const e of mbutaCorpus as Array<{ lari?: string }>) addWord(e.lari);
}

const slice = words.slice(START, START + (LIMIT === Infinity ? words.length : LIMIT));
console.log(`📚 ${words.length} unique lemmas total | processing ${slice.length} (start=${START})`);
console.log(`⚙️  concurrency=${CONCURRENCY}, delay=${DELAY_MS}ms`);

// ---------- Worker ----------
let done = 0;
let hits = 0;
let misses = 0;
let errors = 0;
const failures: Array<{ text: string; status: number; detail: string }> = [];

async function callOne(text: string): Promise<void> {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-service-token": SERVICE_TOKEN!,
      },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) {
      errors++;
      const detail = await res.text();
      failures.push({ text, status: res.status, detail: detail.slice(0, 200) });
      console.error(`❌ [${res.status}] "${text}" — ${detail.slice(0, 120)}`);
      return;
    }

    const data = await res.json().catch(() => ({}));
    if (data.cached === true) hits++;
    else misses++;
    const tag = data.cached ? "✓ hit" : "🆕 gen";
    console.log(`${tag}  ${text}`);
  } catch (err) {
    errors++;
    const message = err instanceof Error ? err.message : String(err);
    failures.push({ text, status: 0, detail: message });
    console.error(`💥 "${text}" — ${message}`);
  } finally {
    done++;
  }
}

async function run() {
  for (let i = 0; i < slice.length; i += CONCURRENCY) {
    const batch = slice.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(callOne));
    if (DELAY_MS > 0 && i + CONCURRENCY < slice.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
    // Stop early on a burst of errors (likely quota exhausted)
    if (errors >= 5 && misses === 0) {
      console.error("🛑 5+ errors with no successful generation — aborting (probable quota issue)");
      break;
    }
  }

  console.log("\n========== SUMMARY ==========");
  console.log(`processed : ${done}`);
  console.log(`cache hits: ${hits}  (0 crédit)`);
  console.log(`generated : ${misses}  (≈ 1 crédit ElevenLabs / mot)`);
  console.log(`errors    : ${errors}`);
  if (failures.length) {
    console.log("\nFirst 10 failures:");
    for (const f of failures.slice(0, 10)) {
      console.log(`  [${f.status}] ${f.text} — ${f.detail}`);
    }
  }
}

run();
