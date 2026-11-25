import { describe, expect, it } from "vitest";
import { AppError, requireSameOrigin } from "./errors";

function request(headers: Record<string, string>) {
  return new Request("http://localhost:3000/api/movies/identify", {
    method: "POST",
    headers,
  });
}

describe("same-origin validation", () => {
  it("uses the browser-facing Host when Next.js normalizes the request URL", () => {
    expect(() => requireSameOrigin(request({
      Host: "127.0.0.1:3000",
      Origin: "http://127.0.0.1:3000",
    }))).not.toThrow();
  });

  it("keeps URL-based validation for requests without a Host header", () => {
    expect(() => requireSameOrigin(request({ Origin: "http://localhost:3000" }))).not.toThrow();
    expect(() => requireSameOrigin(request({ Origin: "https://other.example" }))).toThrow(AppError);
  });

  const invalidHeaders: Record<string, string>[] = [
    {},
    { Origin: "null" },
    { Origin: "https://other.example" },
    { Origin: "http://localhost:3000" },
    { Origin: "http://127.0.0.1:3001" },
    { Origin: "https://127.0.0.1:3000" },
    { Origin: "https://other.example", "X-Forwarded-Host": "other.example" },
  ];
  it.each(invalidHeaders)("rejects missing and mismatched origins even if the internal URL or forwarded host matches", (headers) => {
    expect(() => requireSameOrigin(request({
      Host: "127.0.0.1:3000",
      ...headers,
    }))).toThrow(AppError);
  });
});
