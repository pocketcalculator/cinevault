# CineVault

A single-user, locally run web app for cataloging films in a DVD and Blu-ray library. Built with Next.js, React, TypeScript, and Azure Cosmos DB for NoSQL, with optional Azure OpenAI vision through Microsoft Foundry.

Search by film title, select the correct film and release year, review its details, and add it to your catalog. Saved films persist in Azure; expand an entry to view its metadata, or remove it with confirmation. Duplicate additions keep the existing entry.

You can also upload a DVD or Blu-ray front-cover photo. Azure AI suggests a title and the app runs the same TMDB lookup; review the film and release year before saving. AI never supplies the saved metadata or automatically adds a film.

## How it works

1. Enter a film title, or choose a cover photo and select **Identify cover**.
2. Review the matching films and select the correct title and original release year.
3. Review details from TMDB and award records from Wikidata, then add the film to your catalog.

The catalog stores films, not physical disc editions. Multi-film compilations are not identified as collections: search for each included movie by title and add it separately. The app does not infer a collection's contents from its packaging name.

```text
Title search -----------------------------> TMDB matches
Cover photo -> Azure AI title suggestion -> TMDB matches
    -> Review film details and Wikidata awards -> Save to Cosmos DB
```

The app runs on your machine, but it is not an offline catalog: lookup requires internet access, saved films live in Azure, and cover identification sends the prepared image to Azure AI.

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

Plot shortening is deterministic extraction, **not** AI rewriting. It may end mid-thought on long source sentences. Title search and metadata retrieval do not use paid AI; optional cover identification does.

Award checks use the film's Wikidata ID, or match its TMDB/IMDb ID when missing. Only **award received** (`P166`) counts; nominations do not. Edition-specific prizes are resolved through instance/subclass links. "No win recorded" is not proof of a loss: Wikidata can be incomplete. Outages, missing film records, or incomplete classification show **Unverified**, not a false negative. This is a catalog aid, not an authoritative awards database.

Search displays TMDB's first page of closest matches; refine the title if needed. TMDB and Wikidata responses are cached for up to 24 hours; Azure AI requests are not cached. Saved entries are snapshots and are not automatically refreshed.

## Optional Azure cover identification

Deploy a vision-capable Azure OpenAI model, such as GPT-4.1 mini, in Microsoft Foundry using Standard pay-as-you-go pricing, not provisioned throughput. Add these server-only settings to `.env.local`:

```dotenv
AZURE_OPENAI_ENDPOINT=https://your-resource.services.ai.azure.com/openai/v1/
AZURE_OPENAI_API_KEY=your-key
AZURE_OPENAI_DEPLOYMENT_NAME=your-deployment-name
```

Use the OpenAI **base URL** ending in `/openai/v1/`, not the project endpoint or the full `/responses` URL. Azure endpoints ending in `.openai.azure.com` are also supported. Use the actual deployment name, which may differ from the model name. Restart the app after changing environment settings. Without this configuration, manual title search and the catalog still work.

Choose one JPEG, PNG, or WebP photo up to 5 MB and select **Identify cover**. Convert HEIC files first. The browser resizes the photo to at most 1,600 pixels on its longest side and re-encodes it as JPEG, removing original metadata before sending it. The server independently checks upload size and image format. Clear, tightly cropped front covers work best; glare, remakes, and localized artwork can be ambiguous. Unreadable images and uncertain or multi-movie covers produce an error rather than a guessed title. Edit the suggested title or use manual search if the correct match is missing.

Photos are processed in memory, not written to disk or Cosmos DB, and are not included in application logs. Azure identification requests are not cached and use `store: false` to disable Responses API history storage. This does not disable Azure abuse-monitoring retention; see [Azure data privacy](https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/openai/data-privacy). Global deployments may process images outside the resource's region.

Each explicit identification sends one billable model request; the app does not automatically retry. Image input and the short response incur token charges. Check your deployment's current rates and configure budget alerts (not hard spending caps). No agents, image storage, or additional database resources are required.

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

Unit tests mock providers and do not require credentials. They cover film metadata, awards, catalog writes, upload limits and formats, Azure identification responses and failures, and same-origin validation. The database check requires the real Azure account. Never commit tokens, keys, or data exports; this repository is public.

Browser checks exercise title disambiguation, metadata display, catalog interactions, cover preview and resizing, confirmation before saving, provider errors, and mobile layout with mocked API responses. An additional check exercises the real upload and catalog routes' same-origin validation with invalid payloads, without calling Azure AI or writing to the database:

```bash
npx playwright install chromium
npm run build
npm run test:e2e
```

## Before deploying the web app to Azure

This initial app is **single-user and local-only**. Before public hosting, add authentication and authorization, per-user library partitions, request rate limits, and an appropriate network-access policy. Prefer managed identity over account keys in Azure. The loopback start command must also be changed for the hosting platform. No web hosting resources have been provisioned.

## Credits

Film metadata is supplied by [TMDB](https://www.themoviedb.org). This product uses the TMDB API but is not endorsed or certified by TMDB. Award records are supplied by [Wikidata](https://www.wikidata.org) under CC0. Review TMDB's terms if your use becomes commercial.
