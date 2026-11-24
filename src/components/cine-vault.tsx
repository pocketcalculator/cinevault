"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import type { CatalogMovie, Movie, MovieMatch } from "@/lib/types";

function api(path: string, init: RequestInit & { method: "DELETE" }): Promise<void>;
function api<T>(path: string, init?: RequestInit): Promise<T>;
async function api(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, { cache: "no-store", ...init });
  if (response.status === 204) return;
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error || "The request failed. Please try again.");
  }
  return body;
}

function movieLabel(movie: MovieMatch) {
  return `${movie.title} (${movie.year ?? "year unknown"})`;
}

function FilmDetails({ movie }: { movie: Movie }) {
  return (
    <>
      <div className="film-heading">
        <div className="film-monogram" aria-hidden="true">
          {movie.title.slice(0, 1)}
        </div>
        <div>
          <p className="eyebrow">Validated film</p>
          <h2>{movie.title}</h2>
          {movie.originalTitle !== movie.title && (
            <p className="muted">Original title: {movie.originalTitle}</p>
          )}
        </div>
      </div>
      <dl className="film-facts">
        <div><dt>Release year</dt><dd>{movie.year ?? "Not available"}</dd></div>
        <div>
          <dt>Run time</dt>
          <dd>{movie.runtimeMinutes ? `${movie.runtimeMinutes} minutes` : "Not available"}</dd>
        </div>
        <div><dt>Country of origin / production</dt><dd>{movie.countries.join(", ") || "Not available"}</dd></div>
        <div><dt>Director</dt><dd>{movie.directors.join(", ") || "Not available"}</dd></div>
      </dl>
      <section className="detail-section">
        <h3>The story, in one sentence</h3>
        <p className="plot">{movie.plot ?? "No plot is available from the source."}</p>
        {movie.plotShortened && (
          <p className="small muted">The first synopsis sentence was shortened to 29 words.</p>
        )}
      </section>
      <section className="detail-section">
        <h3>Top five billed actors</h3>
        {movie.actors.length ? (
          <ol className="cast">
            {movie.actors.map((actor, index) => (
              <li key={`${actor.name}-${index}`}>
                <span>{actor.name}</span>
                {actor.character && <span className="muted">{actor.character}</span>}
              </li>
            ))}
          </ol>
        ) : <p className="muted">Cast information is not available.</p>}
        {movie.actors.length > 0 && movie.actors.length < 5 && (
          <p className="small muted">The source lists fewer than five actors.</p>
        )}
      </section>
      <section className="detail-section">
        <h3>Major awards</h3>
        <ul className="awards">
          {movie.awards.map((award) => (
            <li key={award.id}>
              <a href={`https://www.wikidata.org/wiki/${award.id}`} target="_blank" rel="noreferrer">
                {award.name}
              </a>
              <span className={`badge ${award.status}`}>
                {award.status === "won" ? "Winner" : award.status === "not-recorded" ? "No win recorded" : "Unverified"}
              </span>
            </li>
          ))}
        </ul>
        {movie.awardWarning && <p className="notice warning">{movie.awardWarning}</p>}
        <p className="small muted">
          Awards reflect wins recorded in Wikidata, not nominations. Missing records do not prove a film never won.
        </p>
      </section>
      <div className="sources small">
        <a href={movie.sourceUrl} target="_blank" rel="noreferrer">Film details on TMDB</a>
        {movie.wikidataId && (
          <a href={`https://www.wikidata.org/wiki/${movie.wikidataId}`} target="_blank" rel="noreferrer">Award record on Wikidata</a>
        )}
      </div>
    </>
  );
}

export default function CineVault() {
  const [title, setTitle] = useState("");
  const [matches, setMatches] = useState<MovieMatch[] | null>(null);
  const [movie, setMovie] = useState<Movie | null>(null);
  const [catalog, setCatalog] = useState<CatalogMovie[]>([]);
  const [busy, setBusy] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<"lookup" | "catalog">("lookup");

  useEffect(() => {
    const controller = new AbortController();
    api<{ movies: CatalogMovie[] }>("/api/catalog", { signal: controller.signal })
      .then((data) => setCatalog(data.movies))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setCatalogError(error instanceof Error ? error.message : "Could not load your catalog.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCatalogLoading(false);
      });
    return () => controller.abort();
  }, []);

  async function selectMovie(tmdbId: number) {
    setBusy(true);
    setError("");
    setNotice("");
    setMovie(null);
    try {
      const data = await api<{ movie: Movie }>(`/api/movies/${tmdbId}`);
      setMovie(data.movie);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not load film details.");
    } finally {
      setBusy(false);
    }
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    setMovie(null);
    setMatches(null);
    setView("lookup");
    try {
      const data = await api<{ movies: MovieMatch[] }>(
        `/api/movies?title=${encodeURIComponent(title.trim())}`,
      );
      setMatches(data.movies);
      if (data.movies.length === 1) {
        const details = await api<{ movie: Movie }>(`/api/movies/${data.movies[0].tmdbId}`);
        setMovie(details.movie);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not search for films.");
    } finally {
      setBusy(false);
    }
  }

  async function refreshCatalog() {
    setCatalogLoading(true);
    setCatalogError("");
    try {
      const data = await api<{ movies: CatalogMovie[] }>("/api/catalog");
      setCatalog(data.movies);
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : "Could not load your catalog.");
    } finally {
      setCatalogLoading(false);
    }
  }

  async function addMovie() {
    if (!movie || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await api<{ movie: CatalogMovie }>("/api/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmdbId: movie.tmdbId }),
      });
      setNotice(`${data.movie.title} is saved in your catalog.`);
      await refreshCatalog();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save this film.");
    } finally {
      setBusy(false);
    }
  }

  async function removeMovie(entry: CatalogMovie) {
    if (busy || !window.confirm(`Remove ${movieLabel(entry)} from your catalog?`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/api/catalog/${entry.tmdbId}`, { method: "DELETE" });
      setCatalog((current) => current.filter((film) => film.tmdbId !== entry.tmdbId));
      setNotice(`${entry.title} was removed from your catalog.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not remove this film.");
    } finally {
      setBusy(false);
    }
  }

  const isSaved = movie && catalog.some((entry) => entry.tmdbId === movie.tmdbId);

  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="brand" href="/" aria-label="CineVault home">
          <span className="brand-mark" aria-hidden="true">CV</span>
          CineVault<span className="brand-dot">.</span>
        </Link>
        <span className="local-tag">Your personal film archive</span>
      </header>
      <main>
        <section className="hero">
          <p className="eyebrow">Every disc has a story</p>
          <h1>A home for<br />your film collection.</h1>
          <p className="hero-copy">Find the right film. Discover the details. Keep your DVD library beautifully organized.</p>
          <form className="search-form" onSubmit={search}>
            <label htmlFor="film-title">Film title</label>
            <div className="search-controls">
              <input
                id="film-title"
                name="title"
                type="text"
                placeholder="Try The Godfather"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                maxLength={200}
                autoComplete="off"
              />
              <button type="submit" disabled={busy || !title.trim()}>
                {busy ? "Working..." : "Find film"}
              </button>
            </div>
            <p className="small muted">Search by title, then confirm the correct film and release year.</p>
          </form>
        </section>
        <nav className="tabs" aria-label="Library views">
          <button className={view === "lookup" ? "active" : ""} onClick={() => setView("lookup")}>Film lookup</button>
          <button className={view === "catalog" ? "active" : ""} onClick={() => setView("catalog")}>
            My catalog <span className="count">{catalogLoading ? "..." : catalogError ? "!" : catalog.length}</span>
          </button>
        </nav>
        <div aria-live="polite" aria-atomic="true">
          {error && <p className="notice error" role="alert">{error}</p>}
          {notice && <p className="notice success">{notice}</p>}
          {busy && <p className="working" role="status">Retrieving film information...</p>}
        </div>
        {view === "lookup" ? (
          <div className="lookup-grid">
            <section className="panel matches-panel" aria-label="Title matches">
              <p className="eyebrow">The right edition starts here</p>
              <h2>Find your film</h2>
              {matches === null ? (
                <div className="empty-state">
                  <span className="disc" aria-hidden="true" />
                  <p>Your next catalog entry<br />starts with a title.</p>
                </div>
              ) : matches.length === 0 ? (
                <p className="notice">No matching films were found. Check the spelling or try the original title.</p>
              ) : (
                <>
                  <p className="small muted">Closest title matches. Refine your title if you do not see the correct film.</p>
                  <ul className="matches">
                    {matches.map((match) => (
                      <li key={match.tmdbId}>
                        <button
                          className={movie?.tmdbId === match.tmdbId ? "selected" : ""}
                          disabled={busy}
                          onClick={() => selectMovie(match.tmdbId)}
                          aria-pressed={movie?.tmdbId === match.tmdbId}
                        >
                          <span>{match.title}</span>
                          <span className="small muted">
                            {match.year ?? "Year unknown"}
                            {match.originalTitle !== match.title && ` / ${match.originalTitle}`}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
            <section className="panel details-panel" aria-label="Film details">
              {movie ? (
                <>
                  <FilmDetails movie={movie} />
                  <button className="save-button" onClick={addMovie} disabled={busy || Boolean(isSaved)}>
                    {isSaved ? "In your catalog" : "Add DVD to my catalog"}
                  </button>
                </>
              ) : (
                <div className="details-placeholder">
                  <p className="eyebrow">More than a title on a shelf</p>
                  <h2>The complete picture.</h2>
                  <p>Release year, run time, country, director, cast, major award wins, and a one-sentence plot.</p>
                  <div className="placeholder-lines" aria-hidden="true"><span /><span /><span /></div>
                  <p className="small muted">Select a matching film to see its details.</p>
                </div>
              )}
            </section>
          </div>
        ) : (
          <section className="panel catalog-panel" aria-label="Saved DVD catalog">
            <div className="section-heading">
              <div><p className="eyebrow">The collection</p><h2>Films worth keeping.</h2></div>
              <button className="secondary" onClick={refreshCatalog} disabled={catalogLoading || busy}>Refresh catalog</button>
            </div>
            {catalogError ? (
              <p className="notice error" role="alert">{catalogError}</p>
            ) : catalogLoading ? (
              <p className="muted">Loading your catalog...</p>
            ) : catalog.length === 0 ? (
              <div className="empty-state"><span className="disc" aria-hidden="true" /><p>No DVDs saved yet. Find a film to add your first one.</p></div>
            ) : (
              <div className="catalog-list">
                {catalog.map((entry) => (
                  <article className="catalog-entry" key={entry.id}>
                    <details>
                      <summary>
                        <span className="catalog-title">{entry.title}</span>
                        <span className="muted">{entry.year ?? "Year unknown"}</span>
                        <span className="small muted">{entry.directors.join(", ") || "Director unknown"}</span>
                      </summary>
                      <div className="catalog-details">
                        <FilmDetails movie={entry} />
                        <p className="small muted">Saved {new Date(entry.savedAt).toLocaleDateString()}</p>
                        <button className="secondary danger" disabled={busy} onClick={() => removeMovie(entry)}>Remove from catalog</button>
                      </div>
                    </details>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
        {catalogError && view === "lookup" && (
          <p className="notice warning" role="alert">Catalog unavailable: {catalogError}</p>
        )}
      </main>
      <footer>
        <span className="footer-brand">CineVault.</span>
        <div>
          <p className="eyebrow">Credits</p>
          <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">
            <Image src="/tmdb.svg" alt="TMDB" width={100} height={13} unoptimized />
          </a>
          <p>Film data: <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">TMDB</a>. Award records: <a href="https://www.wikidata.org" target="_blank" rel="noreferrer">Wikidata</a>.</p>
          <p className="small muted">This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
        </div>
      </footer>
    </div>
  );
}
