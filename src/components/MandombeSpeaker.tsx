import { useState, useRef, useCallback, useMemo } from "react";
import { Volume2, Loader2 } from "lucide-react";
import { lariToIpa } from "@/lib/g2p";
import { processLariText } from "@/lib/lari-phonetic-engine";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// In-memory audio cache
const audioCache = new Map<string, string>();

interface MandombeSpeakerProps {
  lariText: string;
  className?: string;
}

const MandombeSpeaker = ({ lariText, className = "" }: MandombeSpeakerProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const ipa = lariToIpa(lariText);
  const { syllables } = useMemo(() => processLariText(lariText), [lariText]);
  const syllableDisplay = syllables.map(w => w.join("·")).join(" ");

  const playAudio = useCallback(async () => {
    if (isLoading || isPlaying) return;

    const cacheKey = lariText.toLowerCase().trim();

    if (audioCache.has(cacheKey)) {
      const audio = new Audio(audioCache.get(cacheKey)!);
      audioRef.current = audio;
      setIsPlaying(true);
      audio.onended = () => setIsPlaying(false);
      audio.onerror = () => setIsPlaying(false);
      await audio.play();
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tts-lari-cached`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ text: lariText }),
        }
      );

      if (!response.ok) {
        throw new Error(`TTS failed: ${response.status}`);
      }

      const data = await response.json();
      // Prefer the permanent public URL (cache hit or freshly cached);
      // fall back to inline base64 if upload failed for any reason.
      const audioUrl = data.url
        ? data.url
        : data.audioContent
        ? `data:audio/mpeg;base64,${data.audioContent}`
        : null;

      if (!audioUrl) throw new Error("No audio returned");

      audioCache.set(cacheKey, audioUrl);

      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      setIsPlaying(true);
      audio.onended = () => setIsPlaying(false);
      audio.onerror = () => setIsPlaying(false);
      await audio.play();
    } catch (err) {
      console.error("TTS error:", err);
      setIsPlaying(false);
    } finally {
      setIsLoading(false);
    }
  }, [lariText, isLoading, isPlaying]);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={playAudio}
            disabled={isLoading}
            className={`inline-flex items-center justify-center w-8 h-8 rounded-full transition-colors hover:bg-primary/10 disabled:opacity-50 ${
              isPlaying ? "text-primary animate-pulse" : "text-muted-foreground hover:text-primary"
            } ${className}`}
            aria-label={`Écouter "${lariText}"`}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs font-mono">/{ipa}/</p>
          <p className="text-xs text-muted-foreground">{syllableDisplay}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default MandombeSpeaker;
