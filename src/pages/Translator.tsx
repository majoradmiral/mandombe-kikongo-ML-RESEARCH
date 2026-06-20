import { useState, useCallback, useRef, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { SEO } from "@/components/SEO";
import { ArrowRightLeft, Languages, Loader2, AlertCircle, Copy, Check, ImageIcon, Pencil, Infinity as InfinityIcon } from "lucide-react";
import html2canvas from "html2canvas";
import { toast } from "sonner";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import MandombeSpeaker from "@/components/MandombeSpeaker";
import TranslatorPaywall from "@/components/TranslatorPaywall";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SourceLang = "fr" | "en" | "pt" | "es" | "it" | "ln" | "el" | "ko" | "de" | "lari";

interface TranslationResult {
  translation: string;
  mandombe: string;
  ipa: string;
  notes: string;
}

const langLabels: Record<SourceLang, string> = {
  fr: "Français",
  en: "English",
  pt: "Português",
  es: "Español",
  it: "Italiano",
  ln: "Lingála",
  el: "Ελληνικά",
  ko: "한국어",
  de: "Deutsch",
  lari: "Kikongo Lari",
};

const Translator = () => {
  const { t } = useLanguage();
  const { user, isAdmin, isPremium, hasLifetimeTranslator, translatorUsesRemaining, translatorUsesLimit, session, checkSubscription } = useAuth();
  const [sourceLang, setSourceLang] = useState<SourceLang>("fr");
  const [targetLang, setTargetLang] = useState<SourceLang>("lari");
  const [inputText, setInputText] = useState("");
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [copied, setCopied] = useState<"source" | "target" | "mandombe" | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const mandombeRef = useRef<HTMLParagraphElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const hasUnlimited = isAdmin || isPremium || hasLifetimeTranslator;

  // Handle Stripe return: verify lifetime purchase
  useEffect(() => {
    const status = searchParams.get("lifetime");
    const sessionId = searchParams.get("session_id");
    if (status === "success" && sessionId && session?.access_token) {
      supabase.functions
        .invoke("verify-lifetime-purchase", { body: { session_id: sessionId } })
        .then(({ data, error }) => {
          if (error) {
            toast.error("Vérification du paiement échouée");
          } else if (data?.verified) {
            toast.success("🎉 Accès à vie activé !");
            void checkSubscription();
          }
          searchParams.delete("lifetime");
          searchParams.delete("session_id");
          setSearchParams(searchParams, { replace: true });
        });
    } else if (status === "cancel") {
      toast.info("Paiement annulé");
      searchParams.delete("lifetime");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, session, checkSubscription, setSearchParams]);


  const copyMandombeAsImage = useCallback(async () => {
    if (!mandombeRef.current) return;
    try {
      const canvas = await html2canvas(mandombeRef.current, { backgroundColor: null });
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          setCopied("mandombe");
          toast.success(t("translator.copiedImage") || "Image Mandombe copiée !");
          setTimeout(() => setCopied(null), 2000);
        } catch {
          // Fallback: download
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "mandombe.png";
          a.click();
          URL.revokeObjectURL(url);
          toast.success("Image téléchargée !");
        }
      }, "image/png");
    } catch {
      toast.error("Erreur lors de la capture");
    }
  }, [t]);

  const copyToClipboard = useCallback(async (text: string, side: "source" | "target") => {
    await navigator.clipboard.writeText(text);
    setCopied(side);
    toast.success(t("translator.copied") || "Copié !");
    setTimeout(() => setCopied(null), 2000);
  }, [t]);

  const swap = useCallback(() => {
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    if (result) {
      setInputText(result.translation);
      setResult(null);
    }
  }, [sourceLang, targetLang, result]);

  const saveCorrection = useCallback(async () => {
    if (!result) return;
    if (!isAdmin) {
      toast.error("Session admin requise pour sauvegarder une correction.");
      return;
    }

    let accessToken = session?.access_token;
    if (!accessToken) {
      const { data } = await supabase.auth.getSession();
      accessToken = data.session?.access_token;
    }

    if (!accessToken) {
      toast.error("Reconnectez-vous pour sauvegarder la correction.");
      return;
    }

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/translate-lari`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            text: inputText.trim(),
            direction: `${sourceLang}-to-${targetLang}`,
            correction: true,
            translation: result.translation,
            mandombe: result.mandombe,
            ipa: result.ipa,
            notes: result.notes,
          }),
        }
      );
      if (response.ok) {
        await checkSubscription();
        toast.success(t("translator.correctionSaved") || "Correction sauvegardée !");
      } else {
        const err = await response.json().catch(() => ({}));
        toast.error(err.error || "Erreur lors de la sauvegarde");
      }
    } catch {
      toast.error("Erreur lors de la sauvegarde");
    }
  }, [result, isAdmin, session, checkSubscription, inputText, sourceLang, targetLang, t]);

  const translate = useCallback(async () => {
    if (!inputText.trim()) return;
    setIsLoading(true);
    setError(null);
    setResult(null);
    setIsEditing(false);

    const direction = `${sourceLang}-to-${targetLang}`;
    const notesLang = sourceLang === "lari" ? targetLang : sourceLang;

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/translate-lari`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ text: inputText.trim(), direction, notesLang }),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Erreur ${response.status}`);
      }

      const data: TranslationResult = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setIsLoading(false);
    }
  }, [inputText, sourceLang, targetLang]);

  // Translator is now public — admin still has correction privileges below.

  const targetIsLari = targetLang === "lari";
  const lariText = targetIsLari ? result?.translation : inputText;

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Traducteur Kikongo Lari ↔ 9 langues | Nzo Mikanda"
        description="Traduisez instantanément entre le Kikongo Lari et 9 langues (FR, EN, PT, IT, ES, LN, EL, KO, DE) avec rendu Mandombe et audio."
        path="/translator"
      />
      <Navbar />
      <main className="pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-5xl">
          {/* Header */}
          <div className="text-center mb-10">
            <p className="text-primary font-medium text-sm tracking-widest uppercase mb-2">
              {t("translator.eyebrow")}
            </p>
            <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-3">
              {t("translator.title")}
            </h1>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              {t("translator.subtitle")}
            </p>
          </div>

          {/* Language selector bar */}
          <div className="flex items-center justify-center gap-4 mb-6">
            <Select value={sourceLang} onValueChange={(v) => setSourceLang(v as SourceLang)}>
              <SelectTrigger className="w-[160px] bg-card border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(langLabels) as SourceLang[])
                  .filter((l) => l !== targetLang)
                  .map((l) => (
                    <SelectItem key={l} value={l}>{langLabels[l]}</SelectItem>
                  ))}
              </SelectContent>
            </Select>

            <Button
              variant="ghost"
              size="icon"
              onClick={swap}
              className="rounded-full border border-border hover:bg-accent"
              aria-label="Swap languages"
            >
              <ArrowRightLeft className="w-4 h-4" />
            </Button>

            <Select value={targetLang} onValueChange={(v) => setTargetLang(v as SourceLang)}>
              <SelectTrigger className="w-[160px] bg-card border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(langLabels) as SourceLang[])
                  .filter((l) => l !== sourceLang)
                  .map((l) => (
                    <SelectItem key={l} value={l}>{langLabels[l]}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {/* Translation panels */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Input panel */}
            <div className="bg-card rounded-xl border border-border p-5 flex flex-col">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                {langLabels[sourceLang]}
              </p>
              <Textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={t("translator.placeholder")}
                className="flex-1 min-h-[180px] resize-none border-0 bg-transparent p-0 focus-visible:ring-0 text-foreground text-lg"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    translate();
                  }
                }}
              />
              <div className="flex justify-between items-center mt-3">
                {inputText.trim() && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copyToClipboard(inputText, "source")}
                    className="h-8 w-8"
                    aria-label="Copy source text"
                  >
                    {copied === "source" ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </Button>
                )}
                <div className="ml-auto">
                  <Button
                    onClick={translate}
                    disabled={isLoading || !inputText.trim()}
                    className="gap-2"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Languages className="w-4 h-4" />
                    )}
                    {t("translator.translate")}
                  </Button>
                </div>
              </div>
            </div>

            {/* Result panel */}
            <div className="bg-card rounded-xl border border-border p-5 flex flex-col">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                {langLabels[targetLang]}
              </p>

              {error && (
                <div className="flex items-start gap-2 text-destructive mb-3">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <p className="text-sm">{error}</p>
                </div>
              )}

              {isLoading && (
                <div className="flex-1 flex items-center justify-center min-h-[180px]">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              )}

              {result && !isLoading && (
                <div className="flex-1 min-h-[180px]">
                  {/* Translation text */}
                  <div className="flex items-start justify-between gap-2 mb-4">
                    {isEditing ? (
                      <Textarea
                        value={result.translation}
                        onChange={(e) => {
                          const newVal = e.target.value;
                          setResult({ ...result, translation: newVal, mandombe: targetIsLari ? newVal : result.mandombe });
                        }}
                        className="flex-1 min-h-[60px] resize-none border-0 bg-transparent p-0 focus-visible:ring-0 text-foreground text-lg"
                        autoFocus
                      />
                    ) : (
                      <p className="text-lg text-foreground">{result.translation}</p>
                    )}
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (isEditing && isAdmin) {
                            saveCorrection();
                          }
                          setIsEditing(!isEditing);
                        }}
                        className="h-8 w-8"
                        aria-label={isEditing ? "Valider" : "Éditer"}
                      >
                        {isEditing ? <Check className="w-4 h-4 text-green-500" /> : <Pencil className="w-4 h-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copyToClipboard(result.translation, "target")}
                        className="h-8 w-8"
                        aria-label="Copy translation"
                      >
                        {copied === "target" ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>

                  {/* Mandombe rendering */}
                  {result.mandombe && (
                    <div className="flex items-center gap-2 mb-3">
                      <p ref={mandombeRef} className="font-mandombe text-3xl text-primary leading-relaxed">
                        {result.mandombe}
                      </p>
                      {lariText && <MandombeSpeaker lariText={lariText} />}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={copyMandombeAsImage}
                        className="h-8 w-8 shrink-0"
                        aria-label="Copier le Mandombe en image"
                      >
                        {copied === "mandombe" ? <Check className="w-4 h-4 text-green-500" /> : <ImageIcon className="w-4 h-4" />}
                      </Button>
                    </div>
                  )}

                  {/* IPA */}
                  {result.ipa && (
                    <p className="text-sm font-mono text-muted-foreground mb-3">
                      /{result.ipa}/
                    </p>
                  )}

                  {/* Notes */}
                  {(result.notes || (isEditing && isAdmin)) && (
                    <div className="mt-4 p-3 bg-muted/50 rounded-lg border border-border">
                      {isEditing && isAdmin ? (
                        <Textarea
                          value={result.notes || ""}
                          onChange={(e) => setResult({ ...result, notes: e.target.value })}
                          className="min-h-[80px] resize-none text-xs bg-transparent border-0 p-0 focus-visible:ring-0 text-muted-foreground"
                          placeholder="Notes linguistiques..."
                        />
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          <span className="font-semibold">ℹ </span>
                          {result.notes}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {!result && !isLoading && !error && (
                <div className="flex-1 flex items-center justify-center min-h-[180px] text-muted-foreground text-sm">
                  {t("translator.hint")}
                </div>
              )}
            </div>
          </div>

          {/* Footer note */}
          <p className="text-center text-xs text-muted-foreground mt-6 max-w-lg mx-auto">
            {t("translator.disclaimer")}
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Translator;
