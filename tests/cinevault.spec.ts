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
