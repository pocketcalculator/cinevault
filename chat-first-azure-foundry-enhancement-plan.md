# CineVault Chat-First + Azure Foundry Enhancement Plan

## Goal

Transform CineVault into a chat-first experience where users can:

1. Ask whether a movie is already in their catalog.
2. Add movies through explicit confirmation in chat.
3. Upload a DVD/Blu-ray cover image in chat and continue the same add flow.
4. Query existing catalog entries by genre, year, actor, award, and related identifiers.
5. Improve the one-sentence plot summary using AI.

This plan is implementation-ready but intentionally code-free.

## Recommended Target Architecture

1. **Chat UI (frontend)**: A primary conversational interface with message history, upload control, and action confirmations.
2. **Chat Orchestrator API**: A new backend route (for example, `/api/chat`) that calls Azure OpenAI Responses API and mediates tool calls.
3. **Deterministic Tool Layer**: Server-side functions exposed to the model:
   - `checkMovieOwnership(title)`
   - `searchCatalog(filters)`
   - `identifyCoverAndSuggestTitle(image)`
   - `getMovieDetails(tmdbId)`
   - `addMovieToCatalog(tmdbId)`
4. **Cosmos DB as source of truth**: Keep persistence deterministic and enforce write rules server-side.
5. **Optional Foundry IQ (Azure AI Search)**: Add semantic/hybrid retrieval for fuzzy catalog questions.
6. **AI Summary Service**: Generate a constrained one-sentence summary from trusted metadata and store it with versioning.

## Why This Design

- Preserves reliability for ownership checks and writes.
- Uses AI where it adds clear value (conversation, intent parsing, better summaries).
- Creates direct hands-on paths for Azure Foundry skills (models, tools, guardrails, evaluations, observability).

## Phased Delivery Plan

## Phase 0: Product Contract and UX Definition

Define intent classes and exact chat behaviors before implementation.

**Core intents**

- Ownership check ("Do I already have *Interstellar*?")
- Add request ("Add *Interstellar (2014)*")
- Catalog query by attributes ("Show 90s sci-fi with major wins")
- Cover-based lookup and add continuation
- Detail retrieval and confirmation flow

**Acceptance requirements**

- Every turn resolves to: clarify, retrieve, suggest-add, confirm-add, or error.
- No write operation occurs without explicit confirmation.

**Learning opportunity**

- Prompt/system design for predictable tool routing.

## Phase 1: Data Model and Query Readiness

Ensure stored records support chat retrieval quality and filtering.

**Persist/index key fields**

- `genres[]`
- normalized `actors[]` and `directors[]`
- `year`
- awards with status
- `aiPlotSummary` and `aiSummaryVersion` (new)

**Cosmos considerations**

- Validate indexing policy for frequent filter predicates.
- Retain `libraryId` partition model for future multi-user expansion.

**Learning opportunity**

- Cosmos indexing and partition strategy for conversational workloads.

## Phase 2: Chat Orchestration with Responses API

Implement chat orchestration using Azure OpenAI Responses API.

**Execution pattern**

- Model chooses tool.
- Server validates and executes tool.
- Tool output is returned to model for grounded response composition.
- Write tools are hard-gated by explicit confirmation state.

**Learning opportunity**

- Stateful multi-turn interactions, function/tool calling, structured outputs.

## Phase 3: Cover Upload in Chat

Move cover identification into the conversational workflow.

**Flow**

1. User uploads image in chat.
2. Server runs existing cover-identification logic.
3. Chat returns suggestion + ambiguity/readability state.
4. User confirms candidate and year.
5. Chat offers add action with explicit confirmation.

**Rule**

- Never auto-add from image identification alone.

**Learning opportunity**

- Multimodal chat integration and fallback design.

## Phase 4: Conversational Catalog Retrieval

Support deterministic and natural-language catalog search.

**Deterministic filters first**

- genre, year range, actor, director, award status, free-text title

**Optional semantic layer**

- Add Foundry IQ (Azure AI Search) for fuzzy retrieval and hybrid search.

**Learning opportunity**

- Hybrid retrieval design: strict filters + semantic ranking.

## Phase 5: AI One-Sentence Plot Summary Upgrade

Replace deterministic truncation with constrained AI generation.

**Summary contract**

- Exactly one sentence
- 18-30 words target
- Factual and source-grounded
- Minimal spoilers
- No invented details

**Resilience**

- Validate output format.
- Retry once with stricter constraints on violation.
- Keep deterministic fallback if generation fails.

**Learning opportunity**

- Prompting for constrained, faithful generation and output validation.

## Phase 6: Guardrails and Trust Boundaries

Apply Foundry guardrails and app-level controls.

**Guardrail scope**

- User input moderation
- Output moderation
- Prompt attack/jailbreak protection
- Optional tool call/response controls as applicable

**App enforcement**

- Allowlist tool names and argument schemas.
- Maintain same-origin and backend authorization boundaries.

**Learning opportunity**

- Defense-in-depth with Foundry guardrails plus server-side policy.

## Phase 7: Evaluation and Observability

Create repeatable eval datasets and monitor behavior over prompt/model changes.

**Evaluation sets**

- Ownership-check correctness
- Attribute-filter retrieval correctness
- Add-flow confirmation compliance
- Summary quality and faithfulness

**Operational metrics**

- Tool-call precision
- Hallucination rate
- Confirmation compliance rate
- Conversation completion rate
- Cost per successful task

**Learning opportunity**

- Foundry evaluations, traces, and iterative quality tuning.

## Suggested Implementation Sequence

1. MVP chat: ownership check + explicit add flow.
2. Cover upload in chat + confirm/add continuation.
3. Advanced deterministic catalog filters.
4. AI summary v1 + validation/fallback.
5. Guardrails + evaluations + observability hardening.
6. Optional Foundry IQ semantic retrieval.

## Azure Foundry Hands-On Learning Checklist

- Create and manage a Foundry project and model deployments.
- Integrate the Responses API for stateful tool-using chat.
- Configure guardrails for user input/output and tool boundaries.
- Build and run evaluations in Foundry portal.
- Instrument tracing/monitoring for tool chains and failure classes.
- (Optional) Add Foundry IQ index + hybrid query path.

## Risks and Mitigations

- **Unauthorized writes by model flow** -> Server-side confirmation gate for all add operations.
- **Ambiguous movie identity** -> Mandatory disambiguation turns before add.
- **Summary hallucination** -> Strict prompt contract + validation + deterministic fallback.
- **Token/cost growth** -> Usage telemetry, budget alerts, and bounded context windows.

## Expected Outcome

After this plan, CineVault will provide:

- A chat-first UX for lookup, disambiguation, and catalog actions.
- Reliable ownership/add/search behavior grounded in deterministic backend tools.
- Higher-quality one-sentence summaries with controlled AI usage.
- Practical, end-to-end Azure Foundry experience across build, safety, and evaluation workflows.
