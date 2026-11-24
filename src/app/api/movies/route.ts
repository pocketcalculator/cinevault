import { connection } from "next/server";
import { errorResponse } from "@/lib/errors";
import { searchMovies } from "@/lib/movies";

export async function GET(request: Request) {
  await connection();
  try {
    const title = new URL(request.url).searchParams.get("title") ?? "";
    return Response.json({ movies: await searchMovies(title) });
  } catch (error) {
    return errorResponse(error);
  }
}
