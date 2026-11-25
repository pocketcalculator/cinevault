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

export function requireSameOrigin(request: Request, message = "Catalog changes must come from this app.") {
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  // Next.js can normalize request.url to localhost even when the browser uses 127.0.0.1.
  const host = request.headers.get("host");
  const expectedOrigin = host ? new URL(`${url.protocol}//${host}`).origin : url.origin;
  if (!origin || origin !== expectedOrigin) {
    throw new AppError(message, 403);
  }
}
