import { AppError, errorResponse } from "@/lib/errors";
import { movieIdSchema } from "@/lib/film";
import { getMovie } from "@/lib/movies";

export async function GET(_request: Request, context: RouteContext<"/api/movies/[id]">) {
  try {
    const { id } = await context.params;
    const parsed = movieIdSchema.safeParse(id);
    if (!parsed.success) throw new AppError("Invalid film identifier.", 400);
    return Response.json({ movie: await getMovie(parsed.data) });
  } catch (error) {
    return errorResponse(error);
  }
}
