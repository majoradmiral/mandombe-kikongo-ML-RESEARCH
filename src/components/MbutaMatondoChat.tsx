import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Send, Loader2, GraduationCap, Volume2, Mic, MicOff, VolumeX, Pencil } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import PronunciationCheck from "@/components/PronunciationCheck";

import lecon00 from "../../supabase/functions/_shared/mbuta-lecon-00.json";
import lecon03 from "../../supabase/functions/_shared/mbuta-lecon-03.json";
import leconRestaurant from "../../supabase/functions/_shared/mbuta-lecon-restaurant.json";
import leconEcole from "../../supabase/functions/_shared/mbuta-lecon-ecole.json";
import leconHotel from "../../supabase/functions/_shared/mbuta-lecon-hotel.json";
import leconSePresenter from "../../supabase/functions/_shared/mbuta-lecon-se-presenter.json";
import leconKuNzariMungua from "../../supabase/functions/_shared/mbuta-lecon-ku-nzari-mungua.json";

const LECONS_DU_JOUR: Array<{ ouverture?: { mbuta: string; subtitle: string } }> = [
  lecon00 as any,
  lecon03 as any,
  leconRestaurant as any,
  leconEcole as any,
  leconHotel as any,
  leconSePresenter as any,
  leconKuNzariMungua as any,
];

function getLeconDuJour() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = (now.getTime() - start.getTime()) + ((start.getTimezoneOffset() - now.getTimezoneOffset()) * 60 * 1000);
  const dayOfYear = Math.floor(diff / 86400000);
  return LECONS_DU_JOUR[dayOfYear % LECONS_DU_JOUR.length];
}

type Msg = { role: "user" | "assistant"; content: string };
type Choices = { options: string[]; correctIndex: number };
type Block = { lari: string; fr: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mbuta-matondo`;
const TTS_LARI_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts-lari`;
const STT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stt-lari`;

// ---------- Parsing helpers ----------

/** Pair successive <lari> blocks with their following <fr> sub-titles */
function parseBlocks(content: string): Block[] {
  const re = /<(lari|fr)>([\s\S]*?)<\/\1>/g;
  const blocks: Block[] = [];
  let current: Block | null = null;
  let m;
  while ((m = re.exec(content)) !== null) {
    const tag = m[1] as "lari" | "fr";
    const text = m[2].trim();
    if (!text) continue;
    if (tag === "lari") {
      if (current) blocks.push(current);
      current = { lari: text, fr: "" };
    } else if (tag === "fr" && current) {
      current.fr = current.fr ? `${current.fr} ${text}` : text;
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

function stripForTTS(text: string): string {
  return text
    .replace(/<choices[^>]*>[\s\S]*?<\/choices>/g, "")
    .replace(/<fr>[\s\S]*?<\/fr>/g, "") // never speak FR even if leaked into lari
    .replace(/\[mandombe\](.*?)\[\/mandombe\]/g, "$1")
    .replace(/\([^)]*\)/g, "") // strip parentheticals (often FR notes)
    .replace(/\s*=\s*[^.!?]*/g, "") // strip "X = explication"
    .replace(/[`*_#>]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function parseChoices(content: string): Choices | null {
  const m = content.match(/<choices\s+correct=["'](\d+)["']\s*>([\s\S]*?)<\/choices>/);
  if (!m) return null;
  const correctIndex = parseInt(m[1], 10);
  const options = m[2].split("|").map((s) => s.trim()).filter(Boolean);
  if (options.length < 1 || isNaN(correctIndex) || correctIndex < 0 || correctIndex >= options.length) return null;
  return { options, correctIndex };
}

// ---------- Stream chat ----------

async function streamChat({
  messages, onDelta, onDone, onError,
}: {
  messages: Msg[];
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (status: number, msg: string) => void;
}) {
  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ messages }),
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({ error: "Unknown error" }));
    onError(resp.status, data.error || "Error");
    return;
  }
  if (!resp.body) { onError(500, "No response body"); return; }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let done = false;
  while (!done) {
    const { done: rd, value } = await reader.read();
    if (rd) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      let line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.startsWith("data: ")) continue;
      const j = line.slice(6).trim();
      if (j === "[DONE]") { done = true; break; }
      try {
        const p = JSON.parse(j);
        const c = p.choices?.[0]?.delta?.content as string | undefined;
        if (c) onDelta(c);
      } catch { buf = line + "\n" + buf; break; }
    }
  }
  onDone();
}

// ---------- TTS ----------

const audioCache = new Map<string, HTMLAudioElement>();

async function fetchTTSAudio(text: string): Promise<HTMLAudioElement | null> {
  const plain = stripForTTS(text);
  if (!plain) return null;
  const key = plain.slice(0, 200);
  const cached = audioCache.get(key);
  if (cached) return cached;

  const resp = await fetch(TTS_LARI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ text: plain }),
  });
  if (!resp.ok) throw new Error("TTS failed");
  const data = await resp.json();
  const audio = new Audio(`data:audio/mpeg;base64,${data.audioContent}`);
  audioCache.set(key, audio);
  return audio;
}

async function transcribeAudio(blob: Blob): Promise<string> {
  const fd = new FormData();
  fd.append("audio", blob, "rec.webm");
  const resp = await fetch(STT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
    body: fd,
  });
  if (!resp.ok) throw new Error("STT failed");
  const data = await resp.json();
  return data.text || "";
}

// ---------- Mandombe typewriter bubble ----------

interface BubbleProps {
  block: Block;
  isPlaying: boolean;
  audioDurationMs: number | null;
  onAdminCorrect?: (b: Block) => void;
  isAdmin: boolean;
}

function MandombeBubble({ block, isPlaying, audioDurationMs, onAdminCorrect, isAdmin }: BubbleProps) {
  const [typed, setTyped] = useState(0);
  const [showLari, setShowLari] = useState(false);
  const [showFr, setShowFr] = useState(false);
  const total = block.lari.length;

  useEffect(() => {
    setTyped(0);
    setShowLari(false);
    setShowFr(false);
    if (total === 0) return;
    // Duration: synced to audio if known, else 35ms/char
    const duration = audioDurationMs ?? Math.max(1500, total * 45);
    const stepMs = duration / total;
    let i = 0;
    const id = window.setInterval(() => {
      i++;
      setTyped(i);
      if (i >= total) {
        window.clearInterval(id);
        // Reveal Lari sub then FR after fades
        window.setTimeout(() => setShowLari(true), 100);
        window.setTimeout(() => setShowFr(true), 600);
      }
    }, stepMs);
    return () => window.clearInterval(id);
  }, [block.lari, audioDurationMs, total]);

  return (
    <div className="bg-gold/10 border border-gold/30 rounded-xl px-3 py-3 space-y-2">
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5">
          <GraduationCap className="w-3.5 h-3.5 text-gold" />
          <span className="text-[10px] font-semibold text-gold uppercase tracking-wider">Mbuta Matondo</span>
          {isPlaying && <span className="text-[10px] text-gold/60 animate-pulse">●</span>}
        </div>
        {isAdmin && onAdminCorrect && (
          <button
            onClick={() => onAdminCorrect(block)}
            title="Corriger ce Kikongo Lari"
            className="text-cream/40 hover:text-gold transition-colors"
          >
            <Pencil className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Layer 1 — Mandombe typewriter */}
      <div
        className="font-mandombe text-3xl text-gold leading-loose"
        style={{ minHeight: "1.5em" }}
      >
        {block.lari.slice(0, typed)}
      </div>

      {/* Layer 2 — Kikongo Lari (latin) */}
      <div
        className="text-sm text-cream/90 transition-opacity duration-500"
        style={{ opacity: showLari ? 1 : 0 }}
      >
        {block.lari}
      </div>

      {/* Layer 3 — French sub-title */}
      {block.fr && (
        <div
          className="text-xs italic text-cream/50 transition-opacity duration-500"
          style={{ opacity: showFr ? 1 : 0 }}
        >
          {block.fr}
        </div>
      )}

      {/* Pronunciation evaluator — appears once typewriter is finished */}
      {showLari && (
        <PronunciationCheck expected={block.lari} className="pt-1" />
      )}
    </div>
  );
}

// ---------- Component ----------

const MbutaMatondoChat = () => {
  const { t } = useLanguage();
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [mcqMode, setMcqMode] = useState(true);
  const [answeredIdx, setAnsweredIdx] = useState<Map<number, "correct" | "wrong">>(new Map());
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);
  const [audioDurations, setAudioDurations] = useState<Map<number, number>>(new Map());
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [currentLeconId, setCurrentLeconId] = useState<string>(((lecon00 as any)?.lecon_id) || "default");
  const GOALS_KEY = "mbuta.goalPctByLecon";
  const [goalsByLecon, setGoalsByLecon] = useState<Record<string, number>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(GOALS_KEY);
      if (raw) return JSON.parse(raw);
      // Migration depuis l'ancienne clé globale
      const legacy = window.localStorage.getItem("mbuta.goalPct");
      return legacy ? { default: parseInt(legacy, 10) } : {};
    } catch { return {}; }
  });
  const goalPct = goalsByLecon[currentLeconId] ?? goalsByLecon.default ?? 80;
  const setGoalPct = (v: number) => {
    setGoalsByLecon((prev) => {
      const next = { ...prev, [currentLeconId]: v };
      if (typeof window !== "undefined") window.localStorage.setItem(GOALS_KEY, JSON.stringify(next));
      return next;
    });
  };
  const [goalCelebrated, setGoalCelebrated] = useState(false);
  useEffect(() => { setGoalCelebrated(false); }, [currentLeconId]);

  // Admin correction dialog
  const [editing, setEditing] = useState<{ block: Block } | null>(null);
  const [editLari, setEditLari] = useState("");
  const [editFr, setEditFr] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [savingCorrection, setSavingCorrection] = useState(false);

  // Inline blank fills per message+option (key = `${msgIdx}:${optIdx}`)
  const [blankFills, setBlankFills] = useState<Map<string, string>>(new Map());
  // Persistent variables learned from blanks (e.g. {prenom})
  const [vars, setVars] = useState<Record<string, string>>({});
  // Pending first QCM — revealed only after the learner interacts
  const [pendingFirstQcm, setPendingFirstQcm] = useState<Msg | null>(null);
  const [openingBlock, setOpeningBlock] = useState<{ mbuta: string; subtitle: string } | null>(null);
  const openingContentRef = useRef<string>("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const isPlayingRef = useRef(false);
  const autoSpeakRef = useRef(autoSpeak);

  useEffect(() => { autoSpeakRef.current = autoSpeak; }, [autoSpeak]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ---- Auto-start: open the day's lesson immediately, no user input required ----
  const autoStartedRef = useRef(false);

  // ---- TTS sequential playback for one assistant message ----
  const handleSpeak = useCallback(async (content: string, idx: number) => {
    if (speakingIdx === idx) {
      isPlayingRef.current = false;
      setSpeakingIdx(null);
      return;
    }
    if (isPlayingRef.current) return;
    isPlayingRef.current = true;
    setSpeakingIdx(idx);
    try {
      const blocks = parseBlocks(content);
      // Pre-fetch all audios then play sequentially, saving durations
      for (const b of blocks) {
        if (!isPlayingRef.current) break;
        const audio = await fetchTTSAudio(b.lari);
        if (!audio || !isPlayingRef.current) continue;
        await new Promise<void>((resolve, reject) => {
          audio.onloadedmetadata = () => {
            if (isFinite(audio.duration)) {
              setAudioDurations((prev) => {
                const next = new Map(prev);
                next.set(idx, Math.round(audio.duration * 1000));
                return next;
              });
            }
          };
          audio.onended = () => resolve();
          audio.onerror = () => reject(new Error("audio failed"));
          audio.currentTime = 0;
          audio.play().catch(reject);
        });
      }
    } catch {
      toast({ title: t("mbuta.error"), description: "TTS failed", variant: "destructive" });
    } finally {
      isPlayingRef.current = false;
      setSpeakingIdx(null);
    }
  }, [speakingIdx, t, toast]);

  // ---- Auto-start: leçon 00 ouverture seule. Le premier QCM attend une interaction. ----
  useEffect(() => {
    if (autoStartedRef.current) return;
    if (messages.length > 0) return;
    const lecon: any = lecon00;
    if (!lecon?.ouverture) return;
    autoStartedRef.current = true;

    // Ouverture : affichée en clair sous la vidéo (pas dans une bulle)
    const opening = `<lari>${lecon.ouverture.mbuta}</lari>\n<fr>${lecon.ouverture.subtitle}</fr>`;
    openingContentRef.current = opening;
    setOpeningBlock({ mbuta: lecon.ouverture.mbuta, subtitle: lecon.ouverture.subtitle });

    // Préparer (sans afficher) le premier échange QCM
    const first = lecon.echanges?.[0];
    if (first?.reponses?.length) {
      const correctIndex = first.reponses.findIndex((r: any) => r.correct);
      const optionsStr = first.reponses.map((r: any) => r.mbuta).join("|");
      const qcmContent =
        `<lari>${first.mbuta}</lari>\n<fr>${first.subtitle}</fr>\n` +
        `<choices correct="${Math.max(0, correctIndex)}">${optionsStr}</choices>`;
      setPendingFirstQcm({ role: "assistant", content: qcmContent });
    }

    if (autoSpeakRef.current) {
      setTimeout(() => handleSpeak(opening, -1), 300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Verrou pour empêcher la double révélation (click + typing simultanés)
  const revealedRef = useRef(false);

  // Révèle le premier QCM en attente (après interaction de l'apprenant)
  const revealPendingQcm = useCallback(() => {
    if (revealedRef.current) return;
    if (!pendingFirstQcm) return;
    revealedRef.current = true;
    const qcm = pendingFirstQcm;
    setPendingFirstQcm(null);
    setMessages((prev) => {
      const next = [...prev, qcm];
      const idx = next.length - 1;
      if (autoSpeakRef.current) {
        setTimeout(() => handleSpeak(qcm.content, idx), 200);
      }
      return next;
    });
  }, [pendingFirstQcm, handleSpeak]);

  // ---- Recording ----
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size < 1000) return;
        setIsTranscribing(true);
        try {
          const text = await transcribeAudio(blob);
          if (text) setInput((p) => p + (p ? " " : "") + text);
        } catch {
          toast({ title: t("mbuta.error"), description: "STT failed", variant: "destructive" });
        } finally { setIsTranscribing(false); }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch {
      toast({ title: t("mbuta.error"), description: "Microphone access denied", variant: "destructive" });
    }
  }, [t, toast]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
    setIsRecording(false);
  }, []);

  // ---- Send message ----
  const send = async (overrideText?: string, meta?: { afterWrong?: boolean }) => {
    const text = (overrideText ?? input).trim();
    if (!text || isLoading) return;

    // If user is replying to a wrong-answer prompt, prefix a hidden context
    const userPayload = meta?.afterWrong
      ? `[L'élève corrige sa précédente erreur en cliquant la bonne réponse]: ${text}`
      : text;

    const userMsg: Msg = { role: "user", content: userPayload };
    if (!overrideText) setInput("");
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    let so_far = "";
    const upsert = (chunk: string) => {
      so_far += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: so_far } : m));
        }
        return [...prev, { role: "assistant", content: so_far }];
      });
    };

    try {
      await streamChat({
        messages: [...messages, userMsg],
        onDelta: upsert,
        onDone: () => {
          setIsLoading(false);
          if (autoSpeakRef.current && so_far) {
            setMessages((prev) => {
              const lastIdx = prev.length - 1;
              if (prev[lastIdx]?.role === "assistant") handleSpeak(prev[lastIdx].content, lastIdx);
              return prev;
            });
          }
        },
        onError: (status, msg) => {
          setIsLoading(false);
          if (status === 429) toast({ title: t("mbuta.rateLimited"), description: msg, variant: "destructive" });
          else if (status === 402) toast({ title: t("mbuta.creditsExhausted"), description: msg, variant: "destructive" });
          else toast({ title: t("mbuta.error"), description: msg, variant: "destructive" });
        },
      });
    } catch (e) {
      setIsLoading(false);
      toast({ title: t("mbuta.error"), description: String(e), variant: "destructive" });
    }
  };

  // ---- Variable interpolation ({prenom}, etc.) ----
  const interpolate = useCallback((text: string): string => {
    return text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
  }, [vars]);

  // ---- MCQ pick ----
  const pickChoice = (msgIdx: number, optIdx: number, opt: string, correctIdx: number, options: string[]) => {
    if (isLoading || answeredIdx.get(msgIdx) === "correct") return;
    const isCorrect = optIdx === correctIdx;

    // If option has a blank, fill it and store as {prenom}
    let filledOpt = opt;
    if (opt.includes("___")) {
      const fill = (blankFills.get(`${msgIdx}:${optIdx}`) || "").trim();
      if (!fill) {
        toast({ title: "Complète d'abord le champ", variant: "destructive" });
        return;
      }
      filledOpt = opt.replace(/_{2,}/g, fill);
      // First blank in a question is conventionally the learner's first name
      setVars((prev) => ({ ...prev, prenom: prev.prenom || fill }));
    }

    setAnsweredIdx((prev) => {
      const next = new Map(prev);
      next.set(msgIdx, isCorrect ? "correct" : "wrong");
      return next;
    });
    if (isCorrect) {
      send(filledOpt);
    } else {
      const correctOpt = options[correctIdx];
      send(`(mauvaise réponse: "${filledOpt}" — propose "${correctOpt}" en bouton unique pour répétition)`, { afterWrong: true });
    }
  };

  // ---- Admin correction ----
  const openCorrection = (block: Block) => {
    setEditing({ block });
    setEditLari(block.lari);
    setEditFr(block.fr);
    setEditNotes("");
  };

  const saveCorrection = async () => {
    if (!editing) return;
    setSavingCorrection(true);
    try {
      const { error } = await supabase.from("translation_corrections").insert({
        source_text: editing.block.fr || editing.block.lari,
        source_lang: editing.block.fr ? "fr" : "lari",
        target_lang: "lari",
        corrected_translation: editLari,
        notes: editNotes ? `Mbuta Matondo: ${editNotes}` : "Correction depuis chat Mbuta Matondo",
      });
      if (error) throw error;
      toast({ title: "Correction enregistrée", description: "Mbuta s'en souviendra à la prochaine session." });
      setEditing(null);
    } catch (e: any) {
      toast({ title: "Erreur", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setSavingCorrection(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-3xl mx-auto">
      {/* Score & progression */}
      {(() => {
        const totalQcm = messages.filter((m) => m.role === "assistant" && parseChoices(m.content)).length;
        let correct = 0;
        let wrong = 0;
        answeredIdx.forEach((v) => {
          if (v === "correct") correct++;
          else if (v === "wrong") wrong++;
        });
        const answered = correct + wrong;
        const successPct = answered > 0 ? Math.round((correct / answered) * 100) : 0;
        const goalReached = answered >= 3 && successPct >= goalPct;
        if (goalReached && !goalCelebrated) {
          setTimeout(() => setGoalCelebrated(true), 0);
          setTimeout(() => toast({ title: "🎉 Objectif atteint !", description: `${successPct}% de réussite (objectif ${goalPct}%)` }), 50);
        }
        if (totalQcm === 0) return null;
        return (
          <div className="px-4 py-2 border-b border-gold/10 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-cream/70 gap-3 flex-wrap">
              <span>
                Progression : <span className="text-gold font-semibold">{answered}/{totalQcm}</span>
                {answered > 0 && (
                  <span className="ml-2">
                    Réussite : <span className={goalReached ? "text-emerald-400 font-semibold" : "text-gold font-semibold"}>{successPct}%</span>
                  </span>
                )}
              </span>
              <span className="flex items-center gap-3">
                <span className="text-emerald-400">✓ {correct}</span>
                <span className="text-red-400">✗ {wrong}</span>
                <label className="flex items-center gap-1 text-cream/50">
                  Objectif
                  <select
                    value={goalPct}
                    onChange={(e) => { setGoalPct(parseInt(e.target.value, 10)); setGoalCelebrated(false); }}
                    className="bg-muted/30 border border-gold/20 rounded px-1 py-0.5 text-xs text-cream"
                  >
                    {[50, 60, 70, 80, 90, 100].map((g) => (
                      <option key={g} value={g}>{g}%</option>
                    ))}
                  </select>
                </label>
              </span>
            </div>
            <div className="relative h-1.5 w-full rounded-full bg-muted/30 overflow-hidden">
              <div
                className={`h-full transition-all ${goalReached ? "bg-gradient-to-r from-emerald-500/70 to-emerald-400" : "bg-gradient-to-r from-gold/60 to-gold"}`}
                style={{ width: `${answered > 0 ? successPct : 0}%` }}
              />
              <div
                className="absolute top-0 bottom-0 w-px bg-cream/60"
                style={{ left: `${goalPct}%` }}
                title={`Objectif ${goalPct}%`}
              />
            </div>
            {goalReached && (
              <div className="text-[11px] text-emerald-400 font-semibold">
                🎉 Objectif atteint — {successPct}% de réussite !
              </div>
            )}
          </div>
        );
      })()}

      {/* Toggles */}
      <div className="flex items-center justify-end gap-4 px-4 py-2 border-b border-gold/10">
        <div className="flex items-center gap-2">
          <label htmlFor="mcq-mode" className="text-xs text-cream/50">QCM</label>
          <Switch id="mcq-mode" checked={mcqMode} onCheckedChange={setMcqMode} />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="auto-speak" className="text-xs text-cream/50">{t("mbuta.autoSpeak")}</label>
          <Switch id="auto-speak" checked={autoSpeak} onCheckedChange={setAutoSpeak} />
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 p-4">
        {/* Vidéo d'intro Mbuta Matondo — toujours visible en tête */}
        <div className="flex flex-col items-center gap-3 pb-2">
          <video
            src="/videos/mbuta-matondo-intro.mp4"
            autoPlay loop muted playsInline controls
            className="w-[240px] max-w-full rounded-2xl border-2 border-gold/30 shadow-lg"
          />
          {openingBlock && (
            <div className="text-center space-y-1">
              <div className="font-mandombe text-3xl text-gold leading-loose">
                {openingBlock.mbuta}
              </div>
              <div className="text-sm text-cream/90">{openingBlock.mbuta}</div>
              <div className="text-xs italic text-cream/50">{openingBlock.subtitle}</div>
              <button
                onClick={() => handleSpeak(openingContentRef.current, -1)}
                className="mt-1 inline-flex items-center gap-1 text-xs text-cream/40 hover:text-gold transition-colors"
                title={t("mbuta.speak")}
              >
                {speakingIdx === -1 ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                <span>{speakingIdx === -1 ? "Stop" : t("mbuta.speak")}</span>
              </button>
            </div>
          )}
        </div>

        {messages.map((msg, i) => {
          if (msg.role === "user") {
            // Hide internal hint markers from display
            const display = msg.content
              .replace(/^\[L'élève corrige.*?\]:\s*/, "")
              .replace(/^\(mauvaise réponse.*?\)$/, "");
            if (!display.trim()) return null;
            return (
              <div key={i} className="flex gap-3 justify-end">
                <div className="max-w-[80%] bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-3">
                  <p className="text-sm whitespace-pre-wrap">{display}</p>
                </div>
              </div>
            );
          }

          const interpolatedContent = interpolate(msg.content);
          const blocks = parseBlocks(interpolatedContent);
          const choices = parseChoices(interpolatedContent);
          const status = answeredIdx.get(i);
          const audioDur = audioDurations.get(i) ?? null;

          // On wrong answer, the QCM should reduce to a single button — the correct one.
          let displayChoices = choices;
          if (choices && status === "wrong") {
            displayChoices = {
              options: [choices.options[choices.correctIndex]],
              correctIndex: 0,
            };
          }

          return (
            <div key={i} className="flex gap-3 justify-start">
              <div className="flex flex-col gap-2 max-w-[85%] w-full">
                {blocks.length === 0 ? (
                  <div className="bg-muted/30 border border-gold/10 rounded-2xl rounded-bl-md px-4 py-3">
                    <p className="text-sm text-cream/80 whitespace-pre-wrap">{msg.content}</p>
                  </div>
                ) : (() => {
                  // Fusion : un seul message assistant = une seule bulle, même s'il contient
                  // plusieurs paires <lari>/<fr> (felicitation + question suivante par ex.).
                  const merged: Block = blocks.reduce<Block>(
                    (acc, b) => ({
                      lari: acc.lari ? `${acc.lari} ${b.lari}` : b.lari,
                      fr: acc.fr ? `${acc.fr} ${b.fr}` : b.fr,
                    }),
                    { lari: "", fr: "" },
                  );
                  return (
                    <MandombeBubble
                      block={merged}
                      isPlaying={speakingIdx === i}
                      audioDurationMs={audioDur}
                      onAdminCorrect={openCorrection}
                      isAdmin={isAdmin}
                    />
                  );
                })()}

                {/* MCQ buttons */}
                {mcqMode && displayChoices && !isLoading && (
                  <div className="flex flex-wrap gap-2">
                    {displayChoices.options.map((opt, oi) => {
                      const answered = status === "correct";
                      const hasBlank = opt.includes("___");
                      const fillKey = `${i}:${oi}`;
                      const fillValue = blankFills.get(fillKey) || "";

                      if (hasBlank) {
                        const parts = opt.split(/_{2,}/);
                        const validate = () => {
                          if (!fillValue.trim()) return;
                          if (status === "wrong") {
                            setAnsweredIdx((prev) => {
                              const next = new Map(prev);
                              next.set(i, "correct");
                              return next;
                            });
                            const filled = opt.replace(/_{2,}/g, fillValue.trim());
                            setVars((prev) => ({ ...prev, prenom: prev.prenom || fillValue.trim() }));
                            send(filled);
                          } else {
                            pickChoice(i, oi, opt, choices!.correctIndex, choices!.options);
                          }
                        };
                        return (
                          <div
                            key={oi}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-gold/15 border border-gold/30 text-cream text-xs"
                          >
                            {parts.map((p, pi) => (
                              <span key={pi} className="flex items-center gap-1">
                                {p && <span>{p}</span>}
                                {pi < parts.length - 1 && (
                                  <input
                                    type="text"
                                    value={fillValue}
                                    onChange={(e) =>
                                      setBlankFills((prev) => {
                                        const next = new Map(prev);
                                        next.set(fillKey, e.target.value);
                                        return next;
                                      })
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        validate();
                                      }
                                    }}
                                    disabled={answered}
                                    placeholder="…"
                                    className="bg-earth-deep/60 border border-gold/40 rounded px-2 py-0.5 text-xs w-24 focus:outline-none focus:ring-1 focus:ring-gold"
                                  />
                                )}
                              </span>
                            ))}
                            <button
                              type="button"
                              onClick={validate}
                              disabled={answered || isLoading || !fillValue.trim()}
                              className="ml-1 px-2 py-0.5 rounded-full bg-gold text-earth-deep text-[10px] font-semibold disabled:opacity-40"
                            >
                              OK
                            </button>
                          </div>
                        );
                      }

                      return (
                        <button
                          key={oi}
                          type="button"
                          onClick={() => {
                            if (status === "wrong") {
                              setAnsweredIdx((prev) => {
                                const next = new Map(prev);
                                next.set(i, "correct");
                                return next;
                              });
                              send(opt);
                            } else {
                              pickChoice(i, oi, opt, choices!.correctIndex, choices!.options);
                            }
                          }}
                          disabled={answered || isLoading}
                          className="px-3 py-1.5 rounded-full bg-gold/15 hover:bg-gold/30 border border-gold/30 text-cream text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* TTS */}
                {!isLoading && blocks.length > 0 && (
                  <button
                    onClick={() => handleSpeak(msg.content, i)}
                    className="self-start flex items-center gap-1 text-xs text-cream/40 hover:text-gold transition-colors px-1"
                    title={t("mbuta.speak")}
                  >
                    {speakingIdx === i ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                    <span>{speakingIdx === i ? "Stop" : t("mbuta.speak")}</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}


        {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex gap-3 justify-start">
            <div className="bg-muted/30 border border-gold/10 rounded-2xl rounded-bl-md px-4 py-3">
              <Loader2 className="w-4 h-4 animate-spin text-gold" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gold/20 p-4">
        <div className="flex gap-2 items-end">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isTranscribing}
            className={`p-3 rounded-xl transition-all ${
              isRecording
                ? "bg-red-500 text-white animate-pulse"
                : "bg-muted/20 border border-gold/20 text-cream/60 hover:text-gold hover:border-gold/40"
            } disabled:opacity-40`}
            title={isRecording ? t("mbuta.listening") : t("mbuta.recordHint")}
          >
            {isTranscribing ? <Loader2 className="w-5 h-5 animate-spin" /> :
              isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          <textarea
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (e.target.value && pendingFirstQcm) revealPendingQcm();
            }}
            onKeyDown={handleKeyDown}
            placeholder={t("mbuta.placeholder")}
            rows={1}
            className="flex-1 bg-muted/20 border border-gold/20 rounded-xl px-4 py-3 text-cream placeholder:text-cream/30 resize-none focus:outline-none focus:ring-2 focus:ring-gold/30 text-sm"
            style={{ minHeight: "44px", maxHeight: "120px" }}
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || isLoading}
            className="bg-gold hover:bg-gold/90 text-earth-deep p-3 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Admin correction dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="bg-earth-deep border-gold/30 text-cream">
          <DialogHeader>
            <DialogTitle className="text-gold">Corriger le Kikongo Lari</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-cream/60 mb-1 block">Français (source de la traduction)</label>
              <Input value={editFr} onChange={(e) => setEditFr(e.target.value)} className="bg-muted/20 border-gold/20" />
            </div>
            <div>
              <label className="text-xs text-cream/60 mb-1 block">Kikongo Lari corrigé</label>
              <Textarea value={editLari} onChange={(e) => setEditLari(e.target.value)} rows={3} className="bg-muted/20 border-gold/20" />
            </div>
            <div>
              <label className="text-xs text-cream/60 mb-1 block">Note (optionnel)</label>
              <Input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Ex: 'Ngiele = je vais, pas je suis'" className="bg-muted/20 border-gold/20" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Annuler</Button>
            <Button onClick={saveCorrection} disabled={savingCorrection || !editLari.trim() || !editFr.trim()}>
              {savingCorrection ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MbutaMatondoChat;
