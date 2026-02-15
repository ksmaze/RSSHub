---
name: rsshub-route
description: Create or update an RSSHub route that fetches from a web source and produces an RSS feed. Use when building a new route under lib/routes/, adding a namespace, fetching content via `got` or `flaresolverr`, parsing HTML/JSON, and mapping results to the RSSHub `DataItem` type. Triggers on tasks involving new RSSHub routes, feed creation, scraping a website into RSS items, or converting a web page into an RSSHub-compatible feed.
---

# RSSHub Route Creation

## Workflow

### 1. Understand the source

Before writing code, fetch the target URL and inspect its structure:
- **HTML page** — look at the DOM for repeating item selectors (article lists, table rows, etc.)
- **JSON API** — identify the endpoint, response shape, and relevant fields
- **SPA / dynamic content** — check `__NEXT_DATA__`, XHR endpoints in JS bundles, or network requests. Static HTML may be empty; find the underlying API.

### 2. Create the route files

Every route needs two files inside `lib/routes/<site-name>/`:

**`namespace.ts`** — one per site:
```typescript
import type { Namespace } from '@/types';

export const namespace: Namespace = {
    name: 'Site Name',
    url: 'example.com',           // domain without protocol
    categories: ['programming'],   // see Category type
    description: '',
    lang: 'en',
};
```

**`<route-name>.ts`** — the route handler. Export `handler` and `route`.

### 3. Choose fetch strategy

| Scenario | Tool | Import |
|----------|------|--------|
| Public page/API, no anti-bot | `got` | `import got from '@/utils/got'` |
| Cloudflare-protected site | FlareSolverr | `import { getFlareSolverrSession } from '@/utils/flaresolverr'` |

**`got` pattern:**
```typescript
const { data: response } = await got(url);
const $ = load(response);         // HTML
// or: const json = response;     // JSON (got auto-parses)
```

**FlareSolverr pattern** — see the `flaresolverr-feed` skill for full details. Key points:
- Always `session.destroy()` in a `finally` block
- Set `requirePuppeteer: false` in route features
- For JSON behind Cloudflare: `JSON.parse(load(html)('body').text() || '{}')`

### 4. Parse and map to DataItem[]

Use `cheerio` (`load` from `'cheerio'`) for HTML parsing. Map source data to `DataItem`:

```typescript
const items = $('selector').toArray().map((el) => {
    const $el = $(el);
    return {
        title: $el.find('.title').text().trim(),           // required
        link: $el.find('a').attr('href'),                  // permalink
        description: $el.find('.content').html() ?? '',    // HTML content
        pubDate: parseDate($el.find('.date').text()),       // use @/utils/parse-date
        author: $el.find('.author').text(),
        category: ['tag1'],
        guid: $el.attr('data-id'),
    };
});
```

### 5. Return Data

The handler must return a `Data` object:

```typescript
return {
    title: 'Feed Title',
    link: currentUrl,
    item: items,          // DataItem[]
    allowEmpty: true,     // optional: suppress error on 0 items
    description: '...',   // optional
    language: 'en',       // optional
    image: '...',         // optional: feed logo URL
};
```

### 6. Export the Route object

```typescript
export const route: Route = {
    path: '/example/:param?',
    name: 'Human Readable Name',
    url: 'example.com',
    maintainers: ['github-handle'],
    handler,
    example: '/site-name/example/value',
    parameters: { param: 'Description of param' },
    categories: ['programming'],
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportRadar: true,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        {
            source: ['example.com/path'],
            target: '/example',
        },
    ],
    view: ViewType.Articles,
};
```

## DataItem Quick Reference

| Field | Type | Notes |
|-------|------|-------|
| `title` | `string` | **Required** |
| `link` | `string` | Permalink URL |
| `description` | `string` | HTML content body |
| `pubDate` | `Date\|string\|number` | Always use `parseDate()` |
| `author` | `string \| {name,url?,avatar?}[]` | |
| `category` | `string[]` | Tags |
| `guid` / `id` | `string` | Unique identifier |
| `content` | `{html, text}` | Rich content |
| `image` / `banner` | `string` | Image URLs |
| `enclosure_url` | `string` | Attachment URL |

## Key Utilities

- **`@/utils/got`** — HTTP client with retry/proxy. Returns `{ data }`.
- **`@/utils/ofetch`** — Alternative HTTP client (used in some routes).
- **`cheerio`** — `import { load } from 'cheerio'` for HTML parsing.
- **`@/utils/parse-date`** — `parseDate(str)` for safe date parsing. Never use raw `new Date()`.
- **`@/utils/cache`** — `cache.tryGet(key, fn)` for caching detail page fetches.

## Key Rules

- Route path uses [Hono routing](https://hono.dev/api/routing) syntax.
- `Category` values: `popular`, `social-media`, `new-media`, `traditional-media`, `bbs`, `blog`, `programming`, `design`, `live`, `multimedia`, `picture`, `anime`, `program-update`, `university`, `forecast`, `travel`, `shopping`, `game`, `reading`, `government`, `study`, `journal`, `finance`, `other`.
- `ViewType` enum: `Articles`(0), `SocialMedia`(1), `Pictures`(2), `Videos`(3), `Audios`(4), `Notifications`(5).
- Strip tracking params (utm_source, utm_campaign, etc.) from item links.
- Use `cache.tryGet()` when fetching detail pages to avoid redundant requests.
- For Cloudflare-protected sites, use FlareSolverr — see the `flaresolverr-feed` skill.

## References

- See [references/examples.md](references/examples.md) for complete real-world route examples (got-based API fetch, got-based HTML scrape with detail pages).
