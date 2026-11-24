import "server-only";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { AppError } from "./errors";

export async function fetchJson<T>(
  url: URL,
  schema: z.ZodType<T>,
  source: string,
  headers: Record<string, string> = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(12_000),
      next: { revalidate: 86_400 },
    });
  } catch (error) {
    unstable_rethrow(error);
    throw new AppError(`${source} could not be reached. Try again shortly.`, 502);
  }
  if (!response.ok) {
    if (source === "TMDB" && [401, 403].includes(response.status)) {
      throw new AppError(
        "TMDB rejected the API token. Check TMDB_READ_ACCESS_TOKEN in .env.local.",
        503,
      );
    }
    if (source === "TMDB" && response.status === 404) {
      throw new AppError("This film could not be found on TMDB.", 404);
    }
    throw new AppError(
      `${source} returned an error (${response.status}). Try again shortly.`,
      502,
    );
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new AppError(`${source} returned an invalid response.`, 502);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new AppError(`${source} returned incomplete or invalid data.`, 502);
  }
  return parsed.data;
}
