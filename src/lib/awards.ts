import "server-only";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { AWARDS, type Award } from "./types";
import { AppError } from "./errors";
import { fetchJson } from "./http";

const claimSchema = z.object({
  rank: z.string().optional(),
  mainsnak: z.object({
    snaktype: z.string(),
    datavalue: z.object({ value: z.unknown() }).optional(),
  }),
});
const entitySchema = z.object({
  missing: z.unknown().optional(),
  claims: z.record(z.string(), z.array(claimSchema)).optional(),
});
const entitiesSchema = z.object({
  entities: z.record(z.string(), entitySchema),
});
type Entity = z.infer<typeof entitySchema>;

export function itemClaims(entity: Entity, property: string): string[] {
  return (entity.claims?.[property] ?? []).flatMap((claim) => {
    if (claim.rank === "deprecated" || claim.mainsnak.snaktype !== "value") {
      return [];
    }
    const parsed = z
      .object({ id: z.string().regex(/^Q[1-9]\d*$/) })
      .safeParse(claim.mainsnak.datavalue?.value);
    return parsed.success ? [parsed.data.id] : [];
  });
}

async function entities(ids: string[]) {
  const result: Record<string, Entity> = {};
  for (let start = 0; start < ids.length; start += 50) {
    const url = new URL("https://www.wikidata.org/w/api.php");
    url.search = new URLSearchParams({
      action: "wbgetentities",
      ids: ids.slice(start, start + 50).join("|"),
      props: "claims",
      format: "json",
    }).toString();
    const data = await fetchJson(url, entitiesSchema, "Wikidata", {
      "User-Agent": "CineVault/0.1 (https://github.com/pocketcalculator/cinevault)",
    });
    for (const id of ids.slice(start, start + 50)) {
      const entity = data.entities[id];
      if (!entity || entity.missing !== undefined || !entity.claims) {
        throw new AppError("Wikidata has no available record for this item.", 502);
      }
      result[id] = entity;
    }
  }
  return result;
}

async function resolveFilm(tmdbId: number, imdbId: string | null) {
  const query = `SELECT DISTINCT ?film WHERE {
    { ?film wdt:P4947 "${tmdbId}". }
    ${imdbId && /^tt\d+$/.test(imdbId) ? `UNION { ?film wdt:P345 "${imdbId}". }` : ""}
  } LIMIT 2`;
  const url = new URL("https://query.wikidata.org/sparql");
  url.search = new URLSearchParams({ query, format: "json" }).toString();
  const data = await fetchJson(
    url,
    z.object({
      results: z.object({
        bindings: z.array(z.object({ film: z.object({ value: z.string() }) })),
      }),
    }),
    "Wikidata",
    {
      Accept: "application/sparql-results+json",
      "User-Agent": "CineVault/0.1 (https://github.com/pocketcalculator/cinevault)",
    },
  );
  if (data.results.bindings.length !== 1) return null;
  return data.results.bindings[0].film.value.match(/\/(Q[1-9]\d*)$/)?.[1] ?? null;
}

export async function getAwards(
  tmdbId: number,
  suppliedId: string | null,
  imdbId: string | null,
): Promise<{ awards: Award[]; wikidataId: string | null; awardWarning: string | null }> {
  let wikidataId: string | null = null;
  const recorded = new Set<string>();
  try {
    wikidataId = suppliedId && /^Q[1-9]\d*$/.test(suppliedId)
      ? suppliedId
      : await resolveFilm(tmdbId, imdbId);
    if (!wikidataId) {
      throw new AppError("No unambiguous Wikidata film record was found.", 502);
    }
    const film = (await entities([wikidataId]))[wikidataId];
    for (const id of itemClaims(film, "P166")) recorded.add(id);
    let frontier = [...recorded];
    let levels = 0;

    // Edition-specific prizes can identify the award via instance/subclass links.
    while (frontier.length && levels < 4) {
      const records = await entities(frontier);
      const next: string[] = [];
      for (const entity of Object.values(records)) {
        for (const id of [...itemClaims(entity, "P31"), ...itemClaims(entity, "P279")]) {
          if (!recorded.has(id)) {
            recorded.add(id);
            next.push(id);
          }
        }
      }
      frontier = next;
      levels += 1;
    }
    const incomplete = frontier.length > 0;
    return {
      wikidataId,
      awards: AWARDS.map((award) => ({
        ...award,
        status: recorded.has(award.id) ? "won" : incomplete ? "unavailable" : "not-recorded",
      })),
      awardWarning: incomplete
        ? "Some award classifications could not be fully resolved."
        : null,
    };
  } catch (error) {
    unstable_rethrow(error);
    const message = error instanceof AppError
      ? error.message
      : "Award verification failed unexpectedly.";
    console.error("[CineVault] Award verification:", message);
    return {
      wikidataId,
      awards: AWARDS.map((award) => ({
        ...award,
        status: recorded.has(award.id) ? "won" : "unavailable",
      })),
      awardWarning: message,
    };
  }
}
