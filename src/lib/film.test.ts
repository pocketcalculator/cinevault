import { describe, expect, it } from "vitest";
import { concisePlot, releaseYear, titleSchema } from "./film";

describe("title validation", () => {
  it("trims titles and permits original-language and numeric titles", () => {
    expect(titleSchema.parse("  8 1/2  ")).toBe("8 1/2");
    expect(titleSchema.parse("千と千尋の神隠し")).toBe("千と千尋の神隠し");
  });
  it("rejects blank, oversized, and control-character titles", () => {
    for (const value of [" ", "x".repeat(201), "Film\u0000title"]) {
      expect(titleSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe("one-sentence plot", () => {
  it("uses only the first sentence and retains abbreviations", () => {
    expect(concisePlot("Dr. Jones seeks a relic. His enemies follow.").plot)
      .toBe("Dr. Jones seeks a relic.");
    expect(concisePlot("A U.S. agent finds a clue. Trouble follows.").plot)
      .toBe("A U.S. agent finds a clue.");
  });
  it("enforces fewer than 30 words at the boundary", () => {
    const short = Array.from({ length: 29 }, () => "word").join(" ");
    expect(concisePlot(short).plotShortened).toBe(false);
    const long = concisePlot(`${short} extra. A second sentence.`);
    expect(long.plotShortened).toBe(true);
    expect(long.plot?.split(/\s+/).length).toBe(29);
    expect(long.plot).not.toContain("extra");
  });
  it("represents missing plots explicitly", () => {
    expect(concisePlot("   ")).toEqual({ plot: null, plotShortened: false });
    expect(concisePlot(null).plot).toBeNull();
  });
});

it("does not invent a release year for absent or malformed dates", () => {
  expect(releaseYear("1972-03-14")).toBe(1972);
  expect(releaseYear("")).toBeNull();
  expect(releaseYear("unknown")).toBeNull();
});
