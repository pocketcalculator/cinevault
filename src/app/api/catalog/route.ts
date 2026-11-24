import { z } from "zod";
import { connection } from "next/server";
import { AppError, errorResponse, requireSameOrigin } from "@/lib/errors";
import { findCatalogMovie, listCatalog, saveMovie } from "@/lib/catalog";
import { getMovie } from "@/lib/movies";

export async function GET() {
  await connection();
  try {
    return Response.json({ movies: await listCatalog() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    if (!request.headers.get("content-type")?.startsWith("application/json")) {
      throw new AppError("Expected a JSON request.", 415);
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AppError("Invalid JSON request.", 400);
    }
    const parsed = z.object({
      tmdbId: z.number().int().positive().max(2147483647),
    }).strict().safeParse(body);
    if (!parsed.success) throw new AppError("Supply a valid film identifier.", 400);
    const existing = await findCatalogMovie(parsed.data.tmdbId);
    const movie = existing ?? await saveMovie(await getMovie(parsed.data.tmdbId));
    return Response.json({ movie }, { status: existing ? 200 : 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
