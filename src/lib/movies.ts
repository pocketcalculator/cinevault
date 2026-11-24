import "server-only";
import { z } from "zod";
import { AppError } from "./errors";
import { concisePlot, releaseYear, titleSchema } from "./film";
import { fetchJson } from "./http";
import { getAwards } from "./awards";
import type { Movie, MovieMatch } from "./types";

const matchSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1),
  original_title: z.string(),
  release_date: z.string().nullish(),
});
const detailsSchema = matchSchema.extend({
  runtime: z.number().nonnegative().nullish(),
  overview: z.string().nullish(),
  production_countries: z.array(z.object({ name: z.string() })),
  credits: z.object({
    crew: z.array(z.object({ name: z.string(), job: z.string() })),
    cast: z.array(z.object({
      id: z.number(),
      name: z.string(),
      character: z.string(),
      order: z.number(),
    })),
  }),
  external_ids: z.object({
    wikidata_id: z.string().nullish(),
    imdb_id: z.string().nullish(),
  }),
});

function tmdb<T>(path: string, schema: z.ZodType<T>, params: Record<string, string> = {}) {
  const token = process.env.TMDB_READ_ACCESS_TOKEN?.trim();
  if (!token) {
    throw new AppError(
      "Movie lookup needs a TMDB API Read Access Token. Add TMDB_READ_ACCESS_TOKEN to .env.local.",
      503,
    );
  }
  const url = new URL(`https://api.themoviedb.org/3/${path}`);
  url.search = new URLSearchParams({ language: "en-US", ...params }).toString();
  return fetchJson(url, schema, "TMDB", { Authorization: `Bearer ${token}` });
}

export async function searchMovies(title: string): Promise<MovieMatch[]> {
  const parsed = titleSchema.safeParse(title);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message, 400);
  const data = await tmdb(
    "search/movie",
    z.object({
      results: z.array(matchSchema),
      total_pages: z.number().int().nonnegative(),
    }),
    { query: parsed.data, include_adult: "false" },
  );
  return data.results.map((movie) => ({
    tmdbId: movie.id,
    title: movie.title,
    originalTitle: movie.original_title,
    year: releaseYear(movie.release_date),
  }));
}

export async function getMovie(tmdbId: number): Promise<Movie> {
  const data = await tmdb(`movie/${tmdbId}`, detailsSchema, {
    append_to_response: "credits,external_ids",
  });
  const cast = [...data.credits.cast].sort((a, b) => a.order - b.order);
  const seen = new Set<number>();
  const actors = cast.filter((actor) => {
    if (seen.has(actor.id)) return false;
    seen.add(actor.id);
    return true;
  }).slice(0, 5).map(({ name, character }) => ({ name, character }));
  const awards = await getAwards(
    tmdbId,
    data.external_ids.wikidata_id ?? null,
    data.external_ids.imdb_id ?? null,
  );
  return {
    tmdbId: data.id,
    title: data.title,
    originalTitle: data.original_title,
    year: releaseYear(data.release_date),
    runtimeMinutes: data.runtime && data.runtime > 0 ? data.runtime : null,
    countries: [...new Set(data.production_countries.map(({ name }) => name))],
    directors: [...new Set(
      data.credits.crew.filter(({ job }) => job === "Director").map(({ name }) => name),
    )],
    actors,
    ...concisePlot(data.overview),
    ...awards,
    sourceUrl: `https://www.themoviedb.org/movie/${data.id}`,
    fetchedAt: new Date().toISOString(),
  };
}
