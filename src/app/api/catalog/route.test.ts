import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/catalog", () => ({
  findCatalogMovie: vi.fn(),
  listCatalog: vi.fn(),
  saveMovie: vi.fn(),
}));
vi.mock("@/lib/movies", () => ({ getMovie: vi.fn() }));
import { POST } from "./route";
import { findCatalogMovie, saveMovie } from "@/lib/catalog";
import { getMovie } from "@/lib/movies";
import type { Movie } from "@/lib/types";

const movie: Movie = {
  tmdbId: 1, title: "Verified film", originalTitle: "Verified film", year: 2000,
  runtimeMinutes: 90, countries: ["France"], directors: ["A Director"], actors: [],
  plot: "A detective solves a mystery.", plotShortened: false, awards: [],
  awardWarning: null, wikidataId: null, sourceUrl: "https://www.themoviedb.org/movie/1",
  fetchedAt: "2026-01-01T00:00:00.000Z",
};
const saved = { ...movie, id: "tmdb-1", libraryId: "default", savedAt: movie.fetchedAt };

function request(body: string, origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/catalog", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body,
  });
}

describe("catalog writes", () => {
  beforeEach(() => vi.resetAllMocks());

  it("rejects foreign origins, malformed JSON, and client-supplied metadata", async () => {
    expect((await POST(request('{"tmdbId":1}', "https://other.example"))).status).toBe(403);
    expect((await POST(request("{"))).status).toBe(400);
    expect((await POST(request('{"tmdbId":1,"title":"forged"}'))).status).toBe(400);
    expect(saveMovie).not.toHaveBeenCalled();
  });

  it("uses server-sourced metadata for new films", async () => {
    vi.mocked(findCatalogMovie).mockResolvedValue(null);
    vi.mocked(getMovie).mockResolvedValue(movie);
    vi.mocked(saveMovie).mockResolvedValue(saved);
    expect((await POST(request('{"tmdbId":1}'))).status).toBe(201);
    expect(saveMovie).toHaveBeenCalledWith(movie);
  });

  it("does not duplicate or re-fetch an already saved film", async () => {
    vi.mocked(findCatalogMovie).mockResolvedValue(saved);
    expect((await POST(request('{"tmdbId":1}'))).status).toBe(200);
    expect(getMovie).not.toHaveBeenCalled();
    expect(saveMovie).not.toHaveBeenCalled();
  });
});
