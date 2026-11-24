import { AppError, errorResponse, requireSameOrigin } from "@/lib/errors";
import { movieIdSchema } from "@/lib/film";
import { deleteMovie } from "@/lib/catalog";

export async function DELETE(request: Request, context: RouteContext<"/api/catalog/[id]">) {
  try {
    requireSameOrigin(request);
    const { id } = await context.params;
    const parsed = movieIdSchema.safeParse(id);
    if (!parsed.success) throw new AppError("Invalid film identifier.", 400);
    await deleteMovie(parsed.data);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
