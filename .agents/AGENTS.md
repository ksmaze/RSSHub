# RSSHub Project Notes

## Build & Test

- **Build**: `pnpm build` from the project root.
- **Test full stack**: `docker compose up -d --remove-orphans` to apply changes and restart affected services defined in `docker-compose.yml`. Compose diffs running state against the YAML and only recreates containers whose config changed (ports, volumes, image, env, etc.).
- **Verify routes**: After stack is up, fetch from the RSSHub endpoint. For example, `lib/routes/x1080x/forum.ts` serves `http://localhost:13828/x1080x/forum/263`.

## Docker Stack (`docker-compose.yml`)

- **rsshub** — RSSHub app on port `13828`, uses Redis for cache, browserless for Puppeteer, mounts repo root as `/app`.
- **browserless** — Headless Chrome for Puppeteer (`ws://browserless:3000`). This is no longer used in favor of FlareSolverr.
- **flaresolverr** — FlareSolverr proxy at `http://flaresolverr:8191` (default port) for bypassing Cloudflare. Configured via `FLARESOLVERR_URL` env var in the rsshub container.
- **redis** — Cache backend.
- **service.rss** (FreshRSS) on port `13829`, **db** (Postgres), **watchtower** for auto-updates.

## Key Utilities

### `lib/utils/flaresolverr.ts`
- Wraps the FlareSolverr API (`POST /v1`) with session management.
- `getFlareSolverrSession()` creates a session and returns `{ get, post, destroy }`.
- `get(url, { cookieJar?, maxTimeout? })` fetches a URL via FlareSolverr `request.get`, syncs cookies from/to a `tough-cookie` CookieJar.
- `post(url, { cookieJar?, maxTimeout?, postData? })` sends a POST via FlareSolverr `request.post`. `postData` is the URL-encoded form body string.
- `destroy()` cleans up the FlareSolverr session. Callers should use `finally` blocks.
- Config: `FLARESOLVERR_URL` env var (e.g. `http://flaresolverr:8191`), `FLARESOLVERR_MAX_TIMEOUT` (default `60000`).

### `lib/utils/puppeteer.ts`
- `getPuppeteerPage(url, options)` launches a Puppeteer browser, returns `{ page, destory, browser }`.
- Connects via `PUPPETEER_WS_ENDPOINT` (browserless) or launches locally.

### `lib/utils/cookie-cloud.ts`
- `manager` singleton with a `cookieJar` (tough-cookie `CookieJar`).
- Call `manager.initial(config.cookieCloud)` to start syncing cookies from CookieCloud.
- Use `manager.cookieJar` to pass cookies to flaresolverr/puppeteer/got.

### `lib/utils/got.ts` / `lib/utils/ofetch.ts`
- HTTP clients with retry, proxy, and cookie jar support.

## Config (`lib/config.ts`)
- All configuration via env vars, read in `calculateValue()`.
- Type defined as `Config`, exported as `config`.
- Route-specific configs (cookies, tokens) under named keys (e.g. `config.bilibili`, `config.twitter`).
