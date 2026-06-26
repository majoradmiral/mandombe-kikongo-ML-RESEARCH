import { useCallback, useRef, useState } from "react";
import {
  Mic, Square, Loader2, CheckCircle2, AlertCircle, XCircle, Volume2, RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { lookupLari } from "@/lib/lariDictionary";

const STT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stt-lari`;
const TTS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tts-lari-cached`;

type Verdict = "excellent" | "good" | "retry";
type SylStatus = "ok" | "near" | "wrong" | "missing" | "extra";
type SylCell = { expected: string | null; heard: string | null; status: SylStatus };
type Issue = { expected: string; heard: string; tip: string };

type ApiResult = {
  text: string;
  score: number;
  verdict: Verdict;
  syllables: SylCell[];
  expectedSyllables: string[];
  issues: Issue[];
};

interface Props {
  expected: string;     // The Lari phrase to evaluate against
  mandombe?: string;    // Optional override; otherwise resolved from dictionary
  meaning?: string;     // Optional override; otherwise resolved from dictionary
  className?: string;
  compact?: boolean;    // For dictionary entries: show only the button until a result exists
}

const VERDICT_META: Record<Verdict, { Icon: typeof CheckCircle2; color: string; label: string }> = {
  excellent: { Icon: CheckCircle2, color: "text-emerald-500", label: "Excellent" },
  good:      { Icon: AlertCircle,  color: "text-amber-500",   label: "Presque" },
  retry:     { Icon: XCircle,      color: "text-rose-500",    label: "Réessaye" },
};

const STATUS_CLASS: Record<SylStatus, string> = {
  ok:      "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  near:    "bg-amber-500/15 text-amber-500 border-amber-500/30",
  wrong:   "bg-rose-500/15 text-rose-500 border-rose-500/30",
  missing: "bg-rose-500/10 text-rose-400 border-rose-500/30 line-through",
  extra:   "bg-muted text-muted-foreground border-border italic",
};

const PronunciationCheck = ({ expected, mandombe, meaning, className, compact }: Props) => {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const exampleAudioRef = useRef<HTMLAudioElement | null>(null);

  const dictHit = (!mandombe || !meaning) ? lookupLari(expected) : null;
  const exampleMandombe = mandombe ?? dictHit?.mandombe ?? expected;
  const exampleMeaning = meaning ?? dictHit?.fr ?? "";

  const submit = useCallback(async (blob: Blob) => {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("audio", blob, "rec.webm");
      fd.append("expected", expected);
      const resp = await fetch(STT_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: fd,
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data: ApiResult = await resp.json();
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec");
    } finally {
      setBusy(false);
    }
  }, [expected]);

  const start = useCallback(async () => {
    setError(null);
    setResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size < 1200) { setError("Trop court — réessaye en parlant plus longtemps."); return; }
        await submit(blob);
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setError("Accès au microphone refusé.");
    }
  }, [submit]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    setRecording(false);
  }, []);

  const playExample = useCallback(async () => {
    try {
      if (exampleAudioRef.current) {
        exampleAudioRef.current.currentTime = 0;
        await exampleAudioRef.current.play();
        return;
      }
      const resp = await fetch(TTS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ text: expected }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const url: string | undefined = data.url || (data.audioContent ? `data:audio/mpeg;base64,${data.audioContent}` : undefined);
      if (!url) throw new Error("no audio");
      const audio = new Audio(url);
      exampleAudioRef.current = audio;
      await audio.play();
    } catch {
      setError("Lecture de l'exemple impossible.");
    }
  }, [expected]);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Action row */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={recording ? stop : start}
          disabled={busy}
          title={recording ? "Arrêter" : "Évaluer ma prononciation"}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors",
            recording
              ? "bg-rose-500/20 text-rose-500 hover:bg-rose-500/30"
              : "bg-primary/10 text-primary hover:bg-primary/20",
            busy && "opacity-50 cursor-not-allowed",
          )}
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" />
            : recording ? <Square className="w-3 h-3" />
            : <Mic className="w-3 h-3" />}
          {busy ? "Analyse..." : recording ? "Stop" : "Répéter"}
        </button>

        {result && (() => {
          const { Icon, color, label } = VERDICT_META[result.verdict];
          return (
            <div className={cn("flex items-center gap-1.5 text-[11px]", color)}>
              <Icon className="w-3.5 h-3.5" />
              <span className="font-semibold">{label}</span>
              <span className="opacity-70">— {Math.round(result.score * 100)}%</span>
            </div>
          );
        })()}

        {result && (
          <button
            type="button"
            onClick={start}
            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
            title="Réessayer"
          >
            <RotateCcw className="w-3 h-3" /> Réessayer
          </button>
        )}
      </div>

      {error && <div className="text-[11px] text-rose-500">{error}</div>}

      {/* Diagnostic panel */}
      {result && !compact && (
        <div className="rounded-lg border border-border/60 bg-card/60 p-3 space-y-3">
          {/* Syllable strip */}
          <div className="flex flex-wrap gap-1">
            {result.syllables.map((c, i) => (
              <span
                key={i}
                title={
                  c.status === "missing" ? `Syllabe omise : ${c.expected}`
                  : c.status === "extra" ? `Syllabe ajoutée : ${c.heard}`
                  : `Attendu « ${c.expected} » — entendu « ${c.heard} »`
                }
                className={cn(
                  "px-1.5 py-0.5 rounded border text-[11px] font-mono",
                  STATUS_CLASS[c.status],
                )}
              >
                {c.expected ?? c.heard}
              </span>
            ))}
          </div>

          {/* Heard line */}
          {result.text && (
            <div className="text-[11px] text-muted-foreground italic">
              Entendu : « {result.text} »
            </div>
          )}

          {/* Coaching tips */}
          {result.issues.length > 0 && (
            <ul className="space-y-1 text-[12px] text-foreground/90">
              {result.issues.map((iss, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-primary/70">•</span>
                  <span>
                    <span className="font-mono bg-rose-500/10 text-rose-500 px-1 rounded mr-1">{iss.expected}</span>
                    {iss.tip}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* Correct example card */}
          {result.verdict !== "excellent" && (
            <div className="rounded-md bg-primary/5 border border-primary/20 p-2 flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-primary/70 font-semibold mb-1">
                  Modèle correct
                </div>
                <div className="font-mandombe text-2xl text-primary leading-tight">
                  {exampleMandombe}
                </div>
                <div className="text-sm text-foreground">{expected}</div>
                {exampleMeaning && (
                  <div className="text-[11px] italic text-muted-foreground mt-0.5">
                    {exampleMeaning}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={playExample}
                title="Écouter le modèle"
                className="shrink-0 rounded-md p-1.5 bg-primary/10 text-primary hover:bg-primary/20"
              >
                <Volume2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PronunciationCheck;
