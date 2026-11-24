export const AWARDS = [
  { id: "Q102427", name: "Academy Award for Best Picture" },
  { id: "Q139184", name: "BAFTA Award for Best Film" },
  { id: "Q179808", name: "Palme d'Or" },
  { id: "Q209459", name: "Golden Lion" },
  { id: "Q154590", name: "Golden Bear" },
] as const;

export type Award = {
  id: string;
  name: string;
  status: "won" | "not-recorded" | "unavailable";
};

export type MovieMatch = {
  tmdbId: number;
  title: string;
  originalTitle: string;
  year: number | null;
};

export type Movie = MovieMatch & {
  runtimeMinutes: number | null;
  countries: string[];
  directors: string[];
  actors: { name: string; character: string }[];
  plot: string | null;
  plotShortened: boolean;
  awards: Award[];
  awardWarning: string | null;
  wikidataId: string | null;
  sourceUrl: string;
  fetchedAt: string;
};

export type CatalogMovie = Movie & {
  id: string;
  libraryId: string;
  savedAt: string;
};
