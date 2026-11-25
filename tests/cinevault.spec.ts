import { test, expect } from "@playwright/test";
import { AWARDS, type CatalogMovie, type Movie } from "../src/lib/types";

const film: Movie = {
  tmdbId: 1, title: "The Archive", originalTitle: "The Archive", year: 1999,
  runtimeMinutes: 120, countries: ["France"], directors: ["A Director"],
  actors: Array.from({ length: 5 }, (_, index) => ({ name: `Actor ${index + 1}`, character: `Character ${index + 1}` })),
  plot: "A librarian uncovers a secret hidden inside a film archive.",
  plotShortened: false,
  awards: AWARDS.map((award, index) => ({ ...award, status: index === 0 ? "won" : "not-recorded" })),
  awardWarning: null, wikidataId: "Q1",
  sourceUrl: "https://www.themoviedb.org/movie/1", fetchedAt: "2026-01-01T00:00:00.000Z",
};

test("confirms a remake, displays every field, saves and removes a catalog entry", async ({ page }) => {
  let catalog: CatalogMovie[] = [];
  await page.route("**/api/catalog", async (route) => {
    if (route.request().method() === "POST") {
      expect(route.request().postDataJSON()).toEqual({ tmdbId: 1 });
      catalog = [{ ...film, id: "tmdb-1", libraryId: "default", savedAt: film.fetchedAt }];
      await route.fulfill({ status: 201, json: { movie: catalog[0] } });
    } else {
      await route.fulfill({ json: { movies: catalog } });
    }
  });
  await page.route("**/api/catalog/1", async (route) => {
    catalog = [];
    await route.fulfill({ status: 204 });
  });
  await page.route("**/api/movies?*", (route) => route.fulfill({ json: {
    movies: [
      { tmdbId: 1, title: "The Archive", originalTitle: "The Archive", year: 1999 },
      { tmdbId: 2, title: "The Archive", originalTitle: "The Archive", year: 2020 },
    ],
  } }));
  await page.route("**/api/movies/1", (route) => route.fulfill({ json: { movie: film } }));
  await page.goto("/");
  await page.getByRole("textbox", { name: "Film title" }).fill("The Archive");
  await page.getByRole("button", { name: "Find film", exact: true }).click();
  await expect(page.getByRole("button", { name: "The Archive 2020" })).toBeVisible();
  await page.getByRole("button", { name: "The Archive 1999" }).click();
  const details = page.getByRole("region", { name: "Film details" });
  await expect(details.getByRole("heading", { name: "The Archive", exact: true })).toBeVisible();
  await expect(details.getByText("120 minutes")).toBeVisible();
  await expect(details.getByText("France", { exact: true })).toBeVisible();
  await expect(details.getByText("A Director", { exact: true })).toBeVisible();
  await expect(details.getByText("Actor 5", { exact: true })).toBeVisible();
  await expect(details.getByText(film.plot!)).toBeVisible();
  await expect(details.getByText("Winner", { exact: true })).toHaveCount(1);
  await expect(details.getByText("No win recorded", { exact: true })).toHaveCount(4);
  await page.getByRole("button", { name: "Add DVD to my catalog" }).click();
  await expect(page.getByRole("button", { name: "In your catalog" })).toBeDisabled();
  await page.reload();
  await page.getByRole("button", { name: /My catalog/ }).click();
  await page.locator("summary").click();
  await expect(page.getByRole("heading", { name: "The Archive", exact: true })).toBeVisible();
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Remove from catalog" }).click();
  await expect(page.getByText("No DVDs saved yet.", { exact: false })).toBeVisible();
});

test("displays configuration failures instead of fake data", async ({ page }) => {
  await page.route("**/api/catalog", (route) => route.fulfill({ json: { movies: [] } }));
  await page.route("**/api/movies?*", (route) => route.fulfill({
    status: 503, json: { error: "Movie lookup needs a TMDB API Read Access Token." },
  }));
  await page.goto("/");
  await page.getByRole("textbox", { name: "Film title" }).fill("Film");
  await page.getByRole("button", { name: "Find film", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "TMDB API Read Access Token" })).toBeVisible();
});

test("mobile layout stays within the viewport and handles an empty search", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route("**/api/catalog", (route) => route.fulfill({ json: { movies: [] } }));
  await page.route("**/api/movies?*", (route) => route.fulfill({ json: { movies: [] } }));
  await page.goto("/");
  await page.getByRole("textbox", { name: "Film title" }).fill("Unknown film");
  await page.getByRole("button", { name: "Find film", exact: true }).click();
  await expect(page.getByText("No matching films were found.", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("identifies a cover, normalizes the photo, and reuses film confirmation and saving", async ({ page }) => {
  let catalog: CatalogMovie[] = [];
  let identifications = 0;
  await page.route("**/api/catalog", async (route) => {
    if (route.request().method() === "POST") {
      expect(route.request().postDataJSON()).toEqual({ tmdbId: 1 });
      catalog = [{ ...film, id: "tmdb-1", libraryId: "default", savedAt: film.fetchedAt }];
      await route.fulfill({ json: { movie: catalog[0] } });
    } else {
      await route.fulfill({ json: { movies: catalog } });
    }
  });
  await page.route("**/api/movies/identify", async (route) => {
    identifications++;
    expect(route.request().headers()["content-type"]).toBe("image/jpeg");
    const image = route.request().postDataBuffer()!;
    expect(image.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    const dimensions = await page.evaluate(async (bytes) => {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)]));
      const size = [bitmap.width, bitmap.height];
      bitmap.close();
      return size;
    }, [...image]);
    expect(dimensions).toEqual([1600, 800]);
    await route.fulfill({ json: { title: "The Archive" } });
  });
  await page.route("**/api/movies?*", (route) => {
    expect(new URL(route.request().url()).searchParams.get("title")).toBe("The Archive");
    return route.fulfill({ json: { movies: [
      { tmdbId: 1, title: "The Archive", originalTitle: "The Archive", year: 1999 },
      { tmdbId: 2, title: "The Archive", originalTitle: "The Archive", year: 2020 },
    ] } });
  });
  await page.route("**/api/movies/1", (route) => route.fulfill({ json: { movie: film } }));
  await page.goto("/");
  const image = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 2000;
    canvas.height = 1000;
    canvas.getContext("2d")!.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("Or identify a DVD / Blu-ray cover").setInputFiles({
    name: "cover.png", mimeType: "image/png", buffer: Buffer.from(image, "base64"),
  });
  await expect(page.getByAltText("Selected cover photo preview")).toBeVisible();
  expect(identifications).toBe(0);
  await page.getByRole("button", { name: "Identify cover", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Film title" })).toHaveValue("The Archive");
  await expect(page.getByText('AI suggested "The Archive".', { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "The Archive 1999" }).click();
  expect(catalog).toEqual([]);
  await page.getByRole("button", { name: "Add DVD to my catalog" }).click();
  await expect(page.getByRole("button", { name: "In your catalog" })).toBeDisabled();
  expect(identifications).toBe(1);
  await page.reload();
  await page.getByRole("button", { name: /My catalog/ }).click();
  await expect(page.locator("summary")).toContainText("The Archive");
});

test("cover errors preserve manual title search and do not save or search automatically", async ({ page }) => {
  let searches = 0;
  let identifications = 0;
  await page.route("**/api/catalog", (route) => {
    expect(route.request().method()).toBe("GET");
    return route.fulfill({ json: { movies: [] } });
  });
  await page.route("**/api/movies/identify", (route) => {
    identifications++;
    return route.fulfill({ status: 422, json: { error: "No readable movie title was identified." } });
  });
  await page.route("**/api/movies?*", (route) => {
    searches++;
    return route.fulfill({ json: { movies: [] } });
  });
  await page.goto("/");
  const input = page.getByLabel("Or identify a DVD / Blu-ray cover");
  await input.setInputFiles({
    name: "too-large.png", mimeType: "image/png", buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
  });
  await expect(page.getByRole("alert").filter({ hasText: "5 MB or smaller" })).toBeVisible();
  expect(identifications).toBe(0);
  await expect(page.getByRole("button", { name: "Identify cover", exact: true })).toBeDisabled();
  await input.setInputFiles({
    name: "cover.png", mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
  });
  await page.getByRole("button", { name: "Identify cover", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "No readable movie title was identified." })).toBeVisible();
  expect(searches).toBe(0);
  await page.getByRole("textbox", { name: "Film title" }).fill("Manual title");
  await page.getByRole("button", { name: "Find film", exact: true }).click();
  await expect(page.getByText("No matching films were found.", { exact: false })).toBeVisible();
  expect(searches).toBe(1);
});

test("real upload and catalog routes accept the browser origin but reject foreign origins", async ({ page }) => {
  await page.route("**/api/catalog", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { movies: [] } });
    } else {
      await route.continue();
    }
  });
  await page.goto("/");
  const statuses = await page.evaluate(async () => {
    const upload = await fetch("/api/movies/identify", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "origin-check",
    });
    const catalog = await fetch("/api/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    return [upload.status, catalog.status];
  });
  expect(statuses).toEqual([415, 400]);
  const foreign = await page.request.post("/api/movies/identify", {
    headers: { Origin: "https://other.example", "Content-Type": "text/plain" },
    data: "origin-check",
  });
  expect(foreign.status()).toBe(403);
});
