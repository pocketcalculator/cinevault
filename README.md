# CineVault

A local-first web app for cataloging a DVD library, built with Next.js, TypeScript, and an Azure Cosmos DB for NoSQL document database.

Search by film title, select the correct film and release year, review its details, and add it to your catalog. Saved films persist in Azure; expand an entry to view its metadata, or remove it with confirmation. Duplicate additions keep the existing entry.

## Run locally

Requires Node.js 22.13+ (for the database check) and npm.

```bash
npm ci
cp .env.example .env.local
```

Obtain a free **API Read Access Token** from [TMDB API settings](https://www.themoviedb.org/settings/api). Set `TMDB_READ_ACCESS_TOKEN` in `.env.local`. Use the read access token, not the shorter API key. Credentials stay server-side; never prefix them with `NEXT_PUBLIC_` or commit `.env.local`.

Set `COSMOS_ENDPOINT`, `COSMOS_KEY`, `COSMOS_DATABASE`, and `COSMOS_CONTAINER` in the same file. The database and container must already exist, with partition key `/libraryId`. With an authenticated Azure CLI, you can configure an account without printing its key:

```bash
node scripts/configure-cosmos.mjs <account-name> <resource-group>
npm run db:check
npm run dev
```

Open **http://localhost:3000**. The server binds to the loopback interface only. To run the production build locally:

```bash
npm run build
npm start
```

Without a TMDB token, the app still opens and your saved catalog works, but lookup displays a configuration error. Database failures are also shown explicitly; the app never substitutes a temporary local catalog.

## Film data and limitations

| Field | Source / behavior |
| --- | --- |
| Validated title and year | TMDB record selected by the user; remakes are separate results |
| Run time | TMDB minutes; missing or zero values show as unavailable |
| Country | Countries of origin/production, not release markets |
| Director | All credits whose job is Director |
| Top five actors | TMDB billing order, deduplicated by person; fewer if unavailable |
| Awards | Wikidata recorded wins for Academy Award for Best Picture, BAFTA Best Film, Palme d'Or, Golden Lion, Golden Bear |
| Plot | First TMDB overview sentence; shortened at a word boundary to 29 words when necessary, with an ellipsis and visible notice |

Plot shortening is deterministic extraction, **not** AI rewriting. It may end mid-thought on long source sentences. No paid AI service is used.

Award checks use the film's Wikidata ID, or match its TMDB/IMDb ID when missing. Only **award received** (`P166`) counts; nominations do not. Edition-specific prizes are resolved through instance/subclass links. "No win recorded" is not proof of a loss: Wikidata can be incomplete. Outages, missing film records, or incomplete classification show **Unverified**, not a false negative. This is a catalog aid, not an authoritative awards database.

Search displays TMDB's first page of closest matches; refine the title if needed. Provider responses are cached for up to 24 hours. Saved entries are snapshots and are not automatically refreshed.

## Azure database and cost

Use **Cosmos DB for NoSQL** with the lifetime free-tier discount, not Azure DocumentDB's MongoDB-compatible offering. The [free tier](https://learn.microsoft.com/en-us/azure/cosmos-db/free-tier) includes 1,000 RU/s and 25 GB for one account per subscription and must be enabled at account creation. Serverless does not support this discount.

For a small catalog, use a single region and a shared database with **400 RU/s**, plus one container. The approved initial setup also caps total account throughput at 1,000 RU/s and uses local redundant periodic backups. This does **not** cap storage costs: monitor storage and any extra resources or throughput. Do not add regions, paid diagnostics, or containers with dedicated throughput without reviewing costs.

Keep the account firewall restricted to your machine's public IPv4 address. If your IP changes, update the firewall before using the app. Do not open access to all networks to work around connection errors.

The application uses a single `default` library partition. `npm run db:check` writes, reads, and deletes a uniquely named temporary document in a separate verification partition.

## Checks

```bash
npm run lint
npm test
npm run build
npm run db:check
```

Unit tests mock providers and do not require credentials. The database check requires the real Azure account. Never commit tokens, keys, or data exports; this repository is public.

Browser checks exercise title disambiguation, metadata display, catalog interactions, provider errors, and mobile layout with mocked API responses:

```bash
npx playwright install chromium
npm run build
npm run test:e2e
```

## Before deploying the web app to Azure

This initial app is **single-user and local-only**. Before public hosting, add authentication and authorization, per-user library partitions, request rate limits, and an appropriate network-access policy. Prefer managed identity over account keys in Azure. The loopback start command must also be changed for the hosting platform. No web hosting resources have been provisioned.

## Credits

Film metadata is supplied by [TMDB](https://www.themoviedb.org). This product uses the TMDB API but is not endorsed or certified by TMDB. Award records are supplied by [Wikidata](https://www.wikidata.org) under CC0. Review TMDB's terms if your use becomes commercial.
