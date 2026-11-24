import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./awards", () => ({
  getAwards: vi.fn(async () => ({ awards: [], wikidataId: null, awardWarning: "Not verified" })),
}));
import { getMovie, searchMovies } from "./movies";

describe("movie metadata", () => {
  beforeEach(() => {
    vi.stubEnv("TMDB_READ_ACCESS_TOKEN", "test-token");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("orders actors by billing, deduplicates, and caps at five", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      id: 1, title: "Verified title", original_title: "Original title", release_date: "1999-01-01",
      runtime: 0, overview: "A detective solves a mystery. A second sentence.",
      production_countries: [{ name: "France" }, { name: "France" }],
      credits: {
        crew: [{ name: "Director", job: "Director" }, { name: "Writer", job: "Writer" }],
        cast: [6, 5, 3, 1, 2, 4, 1].map((id) => ({ id, name: `Actor ${id}`, character: "", order: id })),
      },
      external_ids: { imdb_id: null, wikidata_id: null },
    })));
    const movie = await getMovie(1);
    expect(movie.actors.map(({ name }) => name)).toEqual(["Actor 1", "Actor 2", "Actor 3", "Actor 4", "Actor 5"]);
    expect(movie.directors).toEqual(["Director"]);
    expect(movie.countries).toEqual(["France"]);
    expect(movie.runtimeMinutes).toBeNull();
    expect(movie.plot).toBe("A detective solves a mystery.");
  });

  it("sends a normalized title and keeps ambiguous films distinct", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      total_pages: 1,
      results: [
        { id: 1, title: "Same title", original_title: "Same title", release_date: "1950-01-01" },
        { id: 2, title: "Same title", original_title: "Same title", release_date: "2000-01-01" },
      ],
    }));
    vi.stubGlobal("fetch", fetchMock);
    const movies = await searchMovies(" Same title ");
    expect(fetchMock.mock.calls[0][0].searchParams.get("query")).toBe("Same title");
    expect(movies.map(({ year }) => year)).toEqual([1950, 2000]);
  });

  it("surfaces missing/invalid tokens and upstream failures", async () => {
    vi.stubEnv("TMDB_READ_ACCESS_TOKEN", "");
    await expect(searchMovies("Film")).rejects.toThrow("API Read Access Token");
    vi.stubEnv("TMDB_READ_ACCESS_TOKEN", "test-token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 401 })));
    await expect(searchMovies("Film")).rejects.toThrow("rejected the API token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ results: "invalid" })));
    await expect(searchMovies("Film")).rejects.toThrow("incomplete or invalid data");
  });
});
