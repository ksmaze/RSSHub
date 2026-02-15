# Real-World Route Examples

## Pattern A: `got` + JSON API (alphasignal)

Fetches a JSON API endpoint, parses the HTML content within the response using cheerio, and extracts individual newsletter items.

**Source:** `lib/routes/alphasignal/last-email.ts`

```typescript
import { type Data, type Route, ViewType } from '@/types';
import { type Context } from 'hono';
import got from '@/utils/got';
import { load } from 'cheerio';
import { parseDate } from '@/utils/parse-date';

export const handler = async (ctx: Context): Promise<Data> => {
    const limit: number = Number.parseInt(ctx.req.query('limit') ?? '20', 10);

    const rootUrl = 'https://alphasignal.ai';
    const currentUrl = `${rootUrl}/last-email`;
    const apiUrl = `${rootUrl}/api/last-campaign`;

    const { data: response } = await got(apiUrl);

    const $ = load(response.html);

    const items = $('a.h1[href]')
        .slice(0, limit)
        .toArray()
        .map((el) => {
            const $el = $(el);
            const rawLink = $el.attr('href') ?? '';
            const url = new URL(rawLink);
            url.searchParams.delete('utm_source');
            url.searchParams.delete('utm_campaign');
            url.searchParams.delete('lid');
            const title = $el.text().trim();

            return {
                title,
                link: url.href,
                pubDate: response.timestamp ? parseDate(response.timestamp) : undefined,
            };
        });

    return {
        title: `AlphaSignal - ${response.subject ?? 'Latest Newsletter'}`,
        description: 'The Best of Machine Learning, Summarized by AI.',
        link: currentUrl,
        item: items,
        allowEmpty: true,
    };
};

export const route: Route = {
    path: '/last-email',
    name: 'Latest Email Newsletter',
    url: 'alphasignal.ai',
    maintainers: [],
    handler,
    example: '/alphasignal/last-email',
    parameters: undefined,
    description: 'Get the latest AlphaSignal newsletter items.',
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
            source: ['alphasignal.ai/last-email'],
            target: '/last-email',
        },
    ],
    view: ViewType.Articles,
};
```

**Namespace:** `lib/routes/alphasignal/namespace.ts`

```typescript
import type { Namespace } from '@/types';

export const namespace: Namespace = {
    name: 'AlphaSignal',
    url: 'alphasignal.ai',
    categories: ['programming'],
    description: 'The Best of Machine Learning, Summarized by AI.',
    lang: 'en',
};
```

## Pattern B: `got` + HTML Scrape with Cached Detail Pages (hackernews)

Fetches an HTML listing page, extracts items from DOM rows, then fetches each item's detail page with `cache.tryGet` to avoid redundant requests.

**Source:** `lib/routes/hackernews/index.ts`

```typescript
import { Route, ViewType } from '@/types';
import cache from '@/utils/cache';
import got from '@/utils/got';
import { load } from 'cheerio';
import { parseDate } from '@/utils/parse-date';

export const route: Route = {
    path: '/:section?/:type?/:user?',
    categories: ['programming'],
    view: ViewType.Articles,
    example: '/hackernews/threads/comments_list/dang',
    parameters: {
        section: { description: 'Content section, default to `index`' },
        type: { description: 'Link type, default to `sources`' },
        user: { description: 'Set user, only valid in `threads` and `submitted` sections' },
    },
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        { source: ['news.ycombinator.com/:section', 'news.ycombinator.com/'] },
    ],
    name: 'User',
    maintainers: ['nczitzk', 'xie-dongping'],
    handler,
};

async function handler(ctx) {
    const section = ctx.req.param('section') ?? 'index';
    const type = ctx.req.param('type') ?? 'sources';
    const user = ctx.req.param('user') ?? '';

    const rootUrl = 'https://news.ycombinator.com';
    const currentUrl = `${rootUrl}/${section === 'index' ? '' : section}${user ? '?id=' + user : ''}`;
    const response = await got(currentUrl);
    const $ = load(response.data);

    const list = $('.athing')
        .slice(0, ctx.req.query('limit') ? Number.parseInt(ctx.req.query('limit')) : 30)
        .toArray()
        .map((thing) => {
            thing = $(thing);
            return {
                guid: thing.attr('id'),
                title: thing.find('.titleline').children('a').text(),
                link: `${rootUrl}/item?id=${thing.attr('id')}`,
                origin: thing.find('.titleline').children('a').attr('href'),
                pubDate: parseDate(thing.find('.age').attr('title') ?? thing.next().find('.age').attr('title')),
                author: thing.next().find('.hnuser').text(),
            };
        });

    // Fetch detail pages with cache
    const items = await Promise.all(
        list.map((item) =>
            cache.tryGet(item.guid, async () => {
                const detailResponse = await got({ method: 'get', url: item.link });
                const content = load(detailResponse.data);
                content('.reply').remove();
                item.description = '';
                content('.comtr').each(function () {
                    const author = content(this).find('.hnuser');
                    const comment = content(this).find('.commtext');
                    item.description += `<div><small>${author.text()}</small>${comment.html()}</div>`;
                });
                return item;
            })
        )
    );

    return {
        title: $('title').text(),
        link: currentUrl,
        item: items,
    };
}
```

## Pattern C: `got` + Next.js `__NEXT_DATA__` Extraction (deeplearning)

For Next.js sites that embed data in a `<script id="__NEXT_DATA__">` tag. Parse the JSON from that script to get pre-rendered data.

**Key technique:**
```typescript
const response = await ofetch(currentUrl);
const $ = load(response);
const data = JSON.parse($('script#__NEXT_DATA__').text());
const posts = data.props?.pageProps?.posts ?? [];
```

Then map `posts` to `DataItem[]`. If detail data is needed, use the Next.js data endpoint:
```typescript
const nextBuildId = data.buildId;
const detailUrl = new URL(`_next/data/${nextBuildId}/the-batch/${post.slug}.json`, rootUrl).href;
```

## Source Investigation Tips

When a page appears empty or loads content dynamically:

1. **Check `__NEXT_DATA__`** — Next.js sites embed page data in this script tag
2. **Inspect JS bundles** — Look for API endpoints in the page's JS chunks:
   ```bash
   curl -s 'https://site.com/_next/static/chunks/pages/page-xxx.js' | grep -oP 'queryKey.*?}' | head
   ```
3. **Look for `fetch`/`queryKey` patterns** in the JS to find API routes like `/api/...`
4. **Try common API patterns**: `/api/data`, `/api/posts`, `/_next/data/{buildId}/page.json`
5. **Check iframe srcDoc** — some sites embed content in iframes; the srcDoc may be populated by JS from an API
