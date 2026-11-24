import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { getAwards } from "./awards";

const claim = (id: string, rank = "normal") => ({
  rank,
  mainsnak: { snaktype: "value", datavalue: { value: { id } } },
});
const entity = (claims: Record<string, ReturnType<typeof claim>[]>) => ({ claims });

describe("award verification", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("counts recorded wins, not nominations or deprecated claims", async () => {
    const records = {
      Q1: entity({
        P166: [claim("Q102427"), claim("Q209459", "deprecated")],
        P1411: [claim("Q139184")],
      }),
      Q102427: entity({}),
    };
    vi.stubGlobal("fetch", vi.fn(async (url: URL) => {
      const ids = url.searchParams.get("ids")!.split("|");
      return Response.json({ entities: Object.fromEntries(ids.map((id) => [id, records[id as keyof typeof records]])) });
    }));
    const result = await getAwards(1, "Q1", null);
    expect(result.awards.filter((award) => award.status === "won").map((award) => award.id)).toEqual(["Q102427"]);
    expect(result.awards.find((award) => award.id === "Q139184")?.status).toBe("not-recorded");
    expect(result.awards.find((award) => award.id === "Q209459")?.status).toBe("not-recorded");
  });

  it("resolves edition-specific prize classifications", async () => {
    const records: Record<string, ReturnType<typeof entity>> = {
      Q1: entity({ P166: [claim("Q2")] }),
      Q2: entity({ P31: [claim("Q179808")] }),
      Q179808: entity({}),
    };
    vi.stubGlobal("fetch", vi.fn(async (url: URL) => {
      const ids = url.searchParams.get("ids")!.split("|");
      return Response.json({ entities: Object.fromEntries(ids.map((id) => [id, records[id]])) });
    }));
    expect((await getAwards(1, "Q1", null)).awards.find((award) => award.id === "Q179808")?.status).toBe("won");
  });

  it("keeps a verified direct win when other classifications fail", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ entities: { Q1: entity({ P166: [claim("Q102427"), claim("Q2")] }) } }))
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 })));
    const result = await getAwards(1, "Q1", null);
    expect(result.awards.find((award) => award.id === "Q102427")?.status).toBe("won");
    expect(result.awards.find((award) => award.id === "Q154590")?.status).toBe("unavailable");
    expect(result.awardWarning).toContain("503");
  });

  it("does not claim a film lost when Wikidata is unreachable or ambiguous", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    expect((await getAwards(1, null, null)).awards.every((award) => award.status === "unavailable")).toBe(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      results: { bindings: [{ film: { value: "http://www.wikidata.org/entity/Q1" } }, { film: { value: "http://www.wikidata.org/entity/Q2" } }] },
    })));
    expect((await getAwards(1, null, "tt123")).wikidataId).toBeNull();
  });
});
