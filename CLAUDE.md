# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- Install dependencies: `npm install`
- Run the server: `node server.js` (serves on `http://localhost:3000`, or `$PORT` if set)
- No test suite, build step, or linter is configured (`npm test` is a stub that exits with an error).

There is no watch/reload script — restart `node server.js` manually after changes to `server.js`, `scraperEngine.js`, or `categories.js`. Frontend files under `public/` are served statically, so browser refresh alone picks those up.

## Architecture

This is a small Express app ("Viral Clips Agent") that simulates an AI agent scraping YouTube Shorts, TikTok, and Instagram Reels for viral content in a chosen category, scores each clip's "virality," and renders results in a dashboard.

**Backend (3 files, no framework beyond Express):**
- `server.js` — Express app and all HTTP routes. Holds one in-memory variable (`latestScrapeSession`) that caches the most recent scrape result for the `/api/export` endpoint — there is no database or persistence layer.
- `scraperEngine.js` — all scraping/generation and scoring logic, exported as `runViralAgent`, `calculateVirality`, `generateHookIntelligence`.
- `categories.js` — static array of content categories (id, name, icon, description, tags, search terms) used to drive both scraping queries and UI category cards.

**Data flow per scrape request (`runViralAgent` in `scraperEngine.js`):**
1. Resolve the category from `categories.js` and convert `timeRange` (`24h`/`3d`/`7d`/`30d`) into an hour window.
2. For each requested platform, fetch/generate clips:
   - `fetchYouTubeShorts` shells out to a hardcoded local `yt-dlp` binary path (`YTDLP_PATH` in `scraperEngine.js`) via `execFile` to search real YouTube Shorts metadata. If `yt-dlp` fails or returns nothing, it falls back to `generateFallbackYouTubeShorts`, which fabricates plausible clips from templates.
   - `fetchTikTokClips` and `fetchInstagramReels` do not hit real APIs — they always return synthetic clips drawn from hardcoded per-category datasets (with a generic fallback pool for categories not explicitly listed).
   - Every clip (real or synthetic) gets randomized engagement numbers (likes/comments/shares as a function of views) and passes through `calculateVirality` and `generateHookIntelligence`.
3. `calculateVirality` computes a composite 0–100 "velocity score" from views/hour, like/comment/share ratios, and a recency boost, then buckets it into a viral tier (Supernova/Trending/Rising/Momentum). Caller-supplied `weights` (viewVelocity, likeRatio, commentRatio, shareRatio) adjust the formula.
4. `generateHookIntelligence` deterministically hashes the clip title to pick a "hook type" (Pattern Interrupt, Curiosity Gap, etc.) and audio trend from fixed lists — this is presentation flavor, not derived from real content analysis.
5. All clips are merged, re-scored with any user-supplied weights, sorted by `velocityScore` descending, and ranked.

**API surface (`server.js`):**
- `GET /api/categories` — returns the static category list.
- `POST /api/scrape` — runs `runViralAgent` synchronously, returns the full result JSON.
- `GET /api/scrape-stream` — same agent run, but streamed via Server-Sent Events (`progress`/`complete`/`error`), driven by the `onProgress` callback threaded through `runViralAgent`.
- `GET /api/export?format=csv|json` — exports `latestScrapeSession` (must run a scrape first); CSV export hand-builds rows/headers rather than using a library.

**Frontend (`public/`, vanilla JS, no build tooling):**
- `index.html` / `styles.css` / `app.js` are plain static assets served directly by Express — no bundler, framework, or module system.
- `app.js` caches DOM refs in a single `elements` object, wires up category/time-range/platform selection and weight-tuning sliders, kicks off scraping via `EventSource` against `/api/scrape-stream` (falling back to a plain `fetch` POST to `/api/scrape` on stream error), and renders results as both a card grid and a table view, plus a modal for per-clip "breakdown" details.

## Key things to know when modifying scoring or scraping logic

- `calculateVirality` is called twice per clip during a run: once with default weights inside each `fetchX` function, and again in `runViralAgent` with the caller's actual `weights` — the second call's result is what's kept. Keep this in mind when changing default weight values or the function signature.
- Real data only comes from the YouTube path (and only when the local `yt-dlp` binary at the hardcoded `YTDLP_PATH` succeeds); TikTok and Instagram Reels are always simulated from hardcoded datasets keyed by category id.
- `latestScrapeSession` in `server.js` is process-local, in-memory, single-slot state — it resets on server restart and is shared across all clients (no per-session isolation).
