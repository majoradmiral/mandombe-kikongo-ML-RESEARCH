/**
 * Vérifications QA du dictionnaire / corpus.
 *
 * - Bloque les doublons (par clé Lari normalisée) à l'intérieur d'une leçon.
 * - Vérifie que chaque entrée a `lari`, `french`, `english`.
 * - Refuse les guillemets typographiques (contrainte projet).
 * - Signale (warning, non-bloquant) les divergences de traduction
 *   entre `src/data/lessons.ts` et `mbuta-corpus-v2.json`.
 *
 * Pour ne pas bloquer les évolutions historiques du corpus, seuls les
 * doublons locaux + champs manquants + smart quotes échouent le test ;
 * le reste est rapporté via `console.warn`.
 */
import { describe, it, expect } from "vitest";
import { lessons } from "@/data/lessons";
import corpusV2 from "../../supabase/functions/_shared/mbuta-corpus-v2.json";
import { runDictionaryQA, normalizeLari } from "../../scripts/qa-dictionary-core";
import { KNOWN_DUPLICATES } from "../../scripts/qa-dictionary-baseline";

describe("Dictionary QA", () => {
  const report = runDictionaryQA(lessons as any, corpusV2 as any, KNOWN_DUPLICATES);

  it("normalizes lari keys for duplicate detection", () => {
    expect(normalizeLari("Mbote!")).toBe(normalizeLari("mbote"));
    expect(normalizeLari("N’samu")).toBe(normalizeLari("n'samu"));
  });

  it("has no missing required fields and no smart quotes", () => {
    const blocking = report.errors.filter(
      (e) => /champ `(french|english)` manquant|guillemet typographique|sans `lari`/.test(e),
    );
    if (blocking.length) console.error(blocking.join("\n"));
    expect(blocking).toEqual([]);
  });

  it("has no duplicate entries within a single lesson", () => {
    const localDups = report.errors.filter((e) => e.includes("doublon local"));
    if (localDups.length) console.error(localDups.join("\n"));
    expect(localDups).toEqual([]);
  });

  it("reports cross-lesson and corpus divergences (non-blocking)", () => {
    if (report.warnings.length) {
      console.warn(`[QA] ${report.warnings.length} warning(s) — voir scripts/qa-dictionary.ts`);
    }
    expect(report.stats.lessons).toBeGreaterThan(0);
  });
});
