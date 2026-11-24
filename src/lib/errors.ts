import { unstable_rethrow } from "next/navigation";

export class AppError extends Error {
  constructor(
    message: string,
    public readonly status = 500,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function errorResponse(error: unknown) {
  unstable_rethrow(error);
  if (error instanceof AppError) {
    if (error.status >= 500) {
      console.error("[CineVault]", error.message);
    }
    return Response.json({ error: error.message }, { status: error.status });
  }
  // Do not log SDK objects: they can contain request headers or credentials.
  console.error("[CineVault] Unexpected server error", {
    name: error instanceof Error ? error.name : "UnknownError",
    statusCode:
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : undefined,
  });
  return Response.json(
    { error: "The request failed. Check the server configuration and try again." },
    { status: 500 },
  );
}

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new AppError("Catalog changes must come from this app.", 403);
  }
}
