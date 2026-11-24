import { z } from "zod";

export const titleSchema = z
  .string()
  .trim()
  .min(1, "Enter a film title.")
  .max(200, "Film titles must be 200 characters or fewer.")
  .refine((title) => !/[\u0000-\u001f\u007f]/u.test(title), {
    message: "Film titles cannot contain control characters.",
  });

export const movieIdSchema = z.coerce.number().int().positive().max(2147483647);

export function releaseYear(date: string | null | undefined): number | null {
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? Number(date.slice(0, 4))
    : null;
}

export function concisePlot(overview: string | null | undefined) {
  const text = overview?.replace(/\s+/gu, " ").trim();
  if (!text) return { plot: null, plotShortened: false };

  const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
  const protectedText = text
    .replace(/\b(?:Mr|Mrs|Ms|Dr|Prof|St|Sr|Jr)\./gu, (word) => word.replace(".", "\uE000"))
    .replace(/\b(?:[A-Z]\.){2,}/gu, (word) => word.replaceAll(".", "\uE000"))
    .replace(/\b[A-Z]\.(?=\s+[A-Z])/gu, (word) => word.replace(".", "\uE000"));
  const segment = [...segmenter.segment(protectedText)][0].segment;
  const first = text.slice(0, segment.length).trim();
  const words = first.split(/\s+/u);
  if (words.length < 30) {
    return {
      plot: /[.!?]["')]*$/u.test(first) ? first : `${first}.`,
      plotShortened: false,
    };
  }

  const shortened = words.slice(0, 29).join(" ").replace(/[,;:.!?-]+$/u, "");
  return { plot: `${shortened}...`, plotShortened: true };
}
