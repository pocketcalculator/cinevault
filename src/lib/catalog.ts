import "server-only";
import { CosmosClient, type Container } from "@azure/cosmos";
import { AppError } from "./errors";
import type { CatalogMovie, Movie } from "./types";

const libraryId = "default";
let container: Container | undefined;

function catalogContainer() {
  if (container) return container;
  const endpoint = process.env.COSMOS_ENDPOINT;
  const key = process.env.COSMOS_KEY;
  if (!endpoint || !key) {
    throw new AppError(
      "Catalog storage is not configured. Set COSMOS_ENDPOINT and COSMOS_KEY in .env.local.",
      503,
    );
  }
  const client = new CosmosClient({ endpoint, key });
  container = client
    .database(process.env.COSMOS_DATABASE || "cinevault")
    .container(process.env.COSMOS_CONTAINER || "movies");
  return container;
}

function isCode(error: unknown, code: number) {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

export async function listCatalog(): Promise<CatalogMovie[]> {
  const { resources } = await catalogContainer().items.query<CatalogMovie>(
    {
      query: "SELECT * FROM c WHERE c.libraryId = @libraryId ORDER BY c.savedAt DESC",
      parameters: [{ name: "@libraryId", value: libraryId }],
    },
    { partitionKey: libraryId },
  ).fetchAll();
  return resources;
}

export async function findCatalogMovie(tmdbId: number): Promise<CatalogMovie | null> {
  try {
    const { resource } = await catalogContainer()
      .item(`tmdb-${tmdbId}`, libraryId).read<CatalogMovie>();
    return resource ?? null;
  } catch (error) {
    if (isCode(error, 404)) return null;
    throw error;
  }
}

export async function saveMovie(movie: Movie): Promise<CatalogMovie> {
  const document: CatalogMovie = {
    ...movie,
    id: `tmdb-${movie.tmdbId}`,
    libraryId,
    savedAt: new Date().toISOString(),
  };
  try {
    const { resource } = await catalogContainer().items.create<CatalogMovie>(document);
    if (!resource) throw new AppError("The database did not confirm the saved film.");
    return resource;
  } catch (error) {
    if (isCode(error, 409)) {
      const existing = await findCatalogMovie(movie.tmdbId);
      if (existing) return existing;
    }
    throw error;
  }
}

export async function deleteMovie(tmdbId: number) {
  try {
    await catalogContainer().item(`tmdb-${tmdbId}`, libraryId).delete();
  } catch (error) {
    if (isCode(error, 404)) {
      throw new AppError("This film is no longer in your catalog.", 404);
    }
    throw error;
  }
}
