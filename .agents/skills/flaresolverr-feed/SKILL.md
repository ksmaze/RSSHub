---
name: flaresolverr-feed
description: Use FlareSolverr to fetch web content behind Cloudflare protection and extract it as RSSHub feed DataItem objects. Use when creating or updating an RSSHub route that needs to bypass Cloudflare challenges, scrape HTML or JSON content via FlareSolverr sessions, and produce DataItem[] feeds. Triggers on tasks involving FlareSolverr integration, Cloudflare bypass, converting Puppeteer-based routes to FlareSolverr, or building new scraper routes that return Data/DataItem.
---

# FlareSolverr Feed Extraction

## Workflow

### 1. Create the session

```typescript
import { getFlareSolverrSession } from '@/utils/flaresolverr';
import { manager } from '@/utils/cookie-cloud';
import { config } from '@/config';

await manager.initial(config.cookieCloud);
const session = await getFlareSolverrSession();
```

### 2. Fetch pages inside a try/finally

```typescript
try {
    const { content: html } = await session.get(url, { cookieJar: manager.cookieJar });
    // parse html with cheerio...
} finally {
    await session.destroy();
}
```

`session.get(url, options?)` and `session.post(url, options?)` both return `{ content, cookies, userAgent, status }`.
- `content` is the full HTML string returned by FlareSolverr.
- Pass `{ cookieJar: manager.cookieJar }` to sync cookies automatically.
- `post` accepts an additional `postData` option (URL-encoded form body string).

```typescript
// POST example
const { content: html } = await session.post(url, {
    cookieJar: manager.cookieJar,
    postData: 'key=value&foo=bar',
});
```

### 3. Parse content and build DataItem[]

**HTML pages** — use `cheerio`:
```typescript
import { load } from 'cheerio';
const $ = load(html);
```

**JSON API responses** wrapped in HTML by FlareSolverr:
```typescript
const data = JSON.parse(load(html)('body').text() || '{}');
```

### 4. Return Data

```typescript
return {
    title: 'Feed Title',
    link: feedUrl,
    item: items,   // DataItem[]
};
```

## DataItem Shape

Key fields to populate per item:

| Field | Type | Notes |
|-------|------|-------|
| `title` | `string` | Required |
| `link` | `string` | Permalink |
| `description` | `string` | HTML content |
| `pubDate` | `Date\|string\|number` | Use `parseDate()` from `@/utils/parse-date` |
| `author` | `string` | |
| `guid` | `string` | Unique ID (e.g. thread ID) |
| `category` | `string[]` | Tags |
| `enclosure_url` | `string` | Attachment/image URL |

## Route Skeleton

```typescript
import { DataItem, Route } from '@/types';
import cache from '@/utils/cache';
import { parseDate } from '@/utils/parse-date';
import { manager } from '@/utils/cookie-cloud';
import { getFlareSolverrSession } from '@/utils/flaresolverr';
import { config } from '@/config';
import { load } from 'cheerio';

export const route: Route = {
    path: '/example/:id',
    features: { requirePuppeteer: false, antiCrawler: true },
    name: 'Example',
    maintainers: ['you'],
    handler,
};

async function handler(ctx) {
    await manager.initial(config.cookieCloud);
    const id = ctx.req.param('id');
    const listUrl = `https://example.com/list/${id}`;

    const session = await getFlareSolverrSession();
    try {
        // 1. Fetch listing page
        const { content: listHtml } = await session.get(listUrl, { cookieJar: manager.cookieJar });
        const $ = load(listHtml);

        // 2. Extract items from listing
        const baseItems = $('selector').toArray().map((el) => ({
            id: $(el).attr('data-id'),
            title: $(el).text(),
            link: $(el).find('a').attr('href'),
        })).filter(Boolean);

        // 3. Fetch detail pages with cache
        const items: DataItem[] = [];
        for (const item of baseItems) {
            // eslint-disable-next-line no-await-in-loop
            const detail = (await cache.tryGet(item.id, async () => {
                const { content: detailHtml } = await session.get(item.link, { cookieJar: manager.cookieJar });
                const $d = load(detailHtml);
                return {
                    title: item.title,
                    link: item.link,
                    description: $d('.content').html() || '',
                    pubDate: parseDate($d('.date').text()),
                    guid: item.id,
                } as DataItem;
            })) as DataItem;
            items.push(detail);
        }

        return { title: 'Feed', link: listUrl, item: items };
    } finally {
        await session.destroy();
    }
}
```

## Key Rules

- Always call `session.destroy()` in a `finally` block.
- Set `requirePuppeteer: false` in route features.
- Use `cache.tryGet(key, fn)` for detail page fetches to avoid redundant requests.
- Use `@/utils/parse-date` for date parsing, never raw `new Date()` on user strings.
- The `content` returned by `session.get`/`session.post` is raw HTML. For JSON APIs, extract via `load(html)('body').text()`.
- `session.post(url, { postData })` for form submissions; `postData` is a URL-encoded string.
- Config: `FLARESOLVERR_URL` env var (default docker service: `http://flaresolverr:8191`), `FLARESOLVERR_MAX_TIMEOUT` (default `60000`).

## References

- See [references/examples.md](references/examples.md) for complete real-world route examples (x1080x forum, zodgame forum, javdb).
