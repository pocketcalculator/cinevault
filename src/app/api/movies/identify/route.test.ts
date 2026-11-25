import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { POST } from "./route";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const endpoint = "https://test-resource.services.ai.azure.com/openai/v1/";

function request(body: BodyInit = png, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/movies/identify", {
    method: "POST",
    headers: { Origin: "http://localhost:3000", "Content-Type": "image/png", ...headers },
    body,
    duplex: "half",
  } as RequestInit);
}

function azureResult(result: unknown = { status: "identified", title: " The Archive " }) {
  return Response.json({
    status: "completed",
    output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(result) }] }],
  });
}

describe("cover identification", () => {
  beforeEach(() => {
    vi.stubEnv("AZURE_OPENAI_ENDPOINT", endpoint);
    vi.stubEnv("AZURE_OPENAI_API_KEY", "private-test-key");
    vi.stubEnv("AZURE_OPENAI_DEPLOYMENT_NAME", "cover-deployment");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(azureResult()));
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends a single nonstored Azure request and returns only the normalized title", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ title: "The Archive" });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toBe(`${endpoint}responses`);
    expect(options).toMatchObject({
      method: "POST",
      cache: "no-store",
      headers: { "api-key": "private-test-key" },
    });
    const body = JSON.parse(options!.body as string);
    expect(body).toMatchObject({ model: "cover-deployment", store: false, max_output_tokens: 200 });
    expect(body.input[0].content[1].image_url).toBe(`data:image/png;base64,${png.toString("base64")}`);
    expect(body.text.format).toMatchObject({ type: "json_schema", strict: true });
  });

  it.each([
    ["missing origin", { Origin: "" }, png, 403],
    ["foreign origin", { Origin: "https://other.example" }, png, 403],
    ["unsupported image", { "Content-Type": "image/heic" }, png, 415],
    ["mislabeled image", { "Content-Type": "image/jpeg" }, png, 415],
    ["forged MIME key", { "Content-Type": "constructor" }, png, 415],
    ["empty file", {}, Buffer.alloc(0), 400],
    ["not an image", {}, Buffer.from("not an image"), 415],
    ["oversized content length", { "Content-Length": String(5 * 1024 * 1024 + 1) }, png, 413],
  ])("rejects %s before calling Azure", async (_name, headers, body, status) => {
    expect((await POST(request(body, headers))).status).toBe(status);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("enforces the size limit on a streamed body without a content length", async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(3 * 1024 * 1024));
        controller.enqueue(new Uint8Array(3 * 1024 * 1024));
        controller.close();
      },
    });
    expect((await POST(request(body))).status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["image/jpeg", Buffer.from([0xff, 0xd8, 0xff, 0xe0])],
    ["image/webp", Buffer.from("RIFF0000WEBP")],
  ])("accepts the %s signature for Azure to process", async (type, image) => {
    expect((await POST(request(image, { "Content-Type": type }))).status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_API_KEY", "AZURE_OPENAI_DEPLOYMENT_NAME"])(
    "reports missing %s without calling Azure",
    async (name) => {
      vi.stubEnv(name, "");
      const response = await POST(request());
      expect(response.status).toBe(503);
      expect((await response.json()).error).toContain("You can still search by title");
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each([
    "https://example.com/openai/v1/",
    "https://test-resource.services.ai.azure.com/openai/v1/responses",
    "http://test-resource.services.ai.azure.com/openai/v1/",
  ])("does not send credentials to an invalid endpoint", async (url) => {
    vi.stubEnv("AZURE_OPENAI_ENDPOINT", url);
    expect((await POST(request())).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    [401, 503], [403, 503], [404, 503], [429, 429], [500, 502],
  ])("handles Azure HTTP %s without exposing its response", async (upstream, status) => {
    vi.mocked(fetch).mockResolvedValue(new Response("private-provider-details", { status: upstream }));
    const response = await POST(request());
    expect(response.status).toBe(status);
    expect(await response.text()).not.toContain("private-provider-details");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private-provider-details");
  });

  it("handles network failures without exposing request credentials", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("private-test-key"));
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("private-test-key");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private-test-key");
  });

  it.each(["unreadable", "ambiguous"])("does not treat an %s result as a title", async (status) => {
    vi.mocked(fetch).mockResolvedValue(azureResult({ status, title: null }));
    expect((await POST(request())).status).toBe(422);
  });

  it.each([
    { status: "identified", title: null },
    { status: "identified", title: "x".repeat(201) },
    { status: "identified", title: "Title\nInjected" },
    { status: "invented", title: "Film" },
  ])("rejects unusable identification output", async (result) => {
    vi.mocked(fetch).mockResolvedValue(azureResult(result));
    expect((await POST(request())).status).toBe(502);
  });

  it.each([
    { status: "incomplete", output: [] },
    { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "not JSON" }] }] },
    { unexpected: "response" },
  ])("handles incomplete or malformed provider responses", async (body) => {
    vi.mocked(fetch).mockResolvedValue(Response.json(body));
    expect((await POST(request())).status).toBe(502);
  });

  it("handles a model refusal", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({
      status: "completed",
      output: [{ type: "message", content: [{ type: "refusal", refusal: "Provider detail" }] }],
    }));
    const response = await POST(request());
    expect(response.status).toBe(422);
    expect((await response.json()).error).toContain("declined");
  });
});
