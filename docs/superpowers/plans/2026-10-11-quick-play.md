# Quick play and mobile fullscreen implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task.

**Goal:** One click from a film card enters the player, retaining manual sources, episodes, details, and history; mobile fullscreen attempts landscape locking.
**Architecture:** A shared QuickPlay module owns matching, bounded parallel discovery, initial source selection, history, and startup-only retry. Existing player playback and controls remain responsible for media. API details additionally preserve episode names for safe cross-source matching.
**Tech Stack:** Existing vanilla JavaScript, ArtPlayer, Hls.js, Node test runner, Playwright/Chromium validation, Cloudflare Pages.
**Spec:** User-approved in-chat design (2026-10-11): movie starts directly, series starts at first episode or resumes history, ambiguous works require selection, up to two startup retries, manual controls always available. User additionally requests mobile fullscreen landscape.

## Global constraints
- Existing source selection, episode controls, details/copy links, password protection, history and return navigation remain available.
- Never use a failed speed probe as an availability verdict.
- Never infer that the same array index denotes the same episode across different sources.
- No forced rotation outside fullscreen; gracefully handle unsupported or rejected orientation APIs.
- User has explicitly authorized implementation, PR integration and immediate production publication.

## Review focus
- Same-title remakes and derivative content: conservative matching and explicit selection on ambiguity.
- Failed startup versus normal pause/buffering: bounded retries stop after actual playback.
- History from another work/source and shifted episode ordering: identity and episode-label checks.
- Mobile/browser autoplay restrictions: visible play/unmute and manual controls, no source cycling on policy rejection.
- Fullscreen exit during pending orientation lock: unlock late promises and keep native fallback usable.

### Task 1: Quick entry and matching
Files: create js/quick-play.js, test/quick-play.test.mjs; modify js/api.js, js/app.js, js/douban.js, index.html, player.html.
Interfaces: QuickPlay.open({title,year,kind,id,source}); QuickPlay.prepare() => Promise<boolean>; pure matching/history/episode helpers exported for Node tests.
- [x] Write failing tests for exact-title/year/type matching, ambiguity and episode-name alignment.
- [x] Implement direct player entry, bounded parallel first-page discovery and explicit ambiguity choices.
- [x] Preserve detail metadata and episode names; use safe DOM text for untrusted source data.
- [x] Run targeted tests and verify the old source details entry remains accessible.

### Task 2: Player integration and recovery
Files: js/quick-play.js, js/player.js, player.html, css/player.css.
Interfaces: QuickPlay.onError() => boolean; QuickPlay.attach(video); QuickPlay.manual(); QuickPlay.details(); QuickPlay.restart().
- [x] Integrate prepare before existing player initialization, using existing HLS playback.
- [x] Add collapsed episode area, source/details/restart controls; movie hides episode-only controls.
- [x] Resume verified history; save identity only on actual playback. Retry at most two alternate starts and never after playing/user pause/manual selection.
- [x] Test real decoded HLS frames/time/audio, history resume, movie/series controls, ambiguous titles and fatal startup fallback.

### Task 3: Mobile and publication
Files: js/player.js, css/player.css, version metadata, service-worker.js.
- [x] Add fullscreen event synchronization, delayed metadata retry and native iOS fallback; test supported/rejected/missing orientation APIs and unlock.
- [x] Verify 390px mobile layout and source/episode overlays; no horizontal overflow.
- [x] Run full suite and syntax/diff checks; update release to 1.2.25 and invalidate app-shell cache.
- [ ] Commit, push PR, pass CI, merge and verify Cloudflare production files/version.

## Execution record
- Existing isolated checkout used; implementation/publication explicitly authorized, no further approval gate.

- Independent review found and corrected manual-switch state, adult-card identity, unmappable resume episodes and metadata preservation through history navigation.
- Browser regression harness: `scripts/smoke-quick-play.mjs`; start the local server with `PASSWORD=browser-test-only PORT=8080 node server.mjs`, then run with Playwright installed (`PLAYWRIGHT_MODULE` can point to its module), Chromium (`CHROMIUM_PATH`), and ffmpeg. Uses generated HLS fixtures with real video/audio decoding, not third-party availability claims.
- Browser cases include one-click movie, mobile series resume, ambiguous versions, initial-source failure, manual switching, history entry, unmappable old history, adult cards and bounded failure. Orientation APIs are simulated; physical iOS rotation is browser-controlled.
