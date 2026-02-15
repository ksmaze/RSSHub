# Real-World FlareSolverr Route Examples

## Pattern A: HTML Forum Scraping (x1080x)

Fetches a Discuz forum listing page, parses thread rows with cheerio, then fetches each thread's detail page for full content. Uses JSX `renderToString` for description rendering.

**Source:** `lib/routes/x1080x/forum.tsx`

```typescript
import { DataItem, Route } from '@/types';
import { getCurrentPath } from '@/utils/helpers';
const __dirname = getCurrentPath(import.meta.url);

import cache from '@/utils/cache';
import { parseDate } from '@/utils/parse-date';
import { renderToString } from 'hono/jsx/dom/server';
import { manager } from '@/utils/cookie-cloud';
import { getFlareSolverrSession } from '@/utils/flaresolverr';
import { config } from '@/config';
import { load } from 'cheerio';

const rootUrl = 'https://x999x.me';

export const route: Route = {
    path: '/forum/:fid?',
    features: { requirePuppeteer: false, antiCrawler: true, nsfw: true },
    name: 'forum',
    maintainers: ['ksmaze'],
    handler,
};

async function handler(ctx) {
    await manager.initial(config.cookieCloud);
    const fid = ctx.req.param('fid');
    const subUrl = `${rootUrl}/forum.php?mod=forumdisplay&fid=${fid}&orderby=dateline`;

    const session = await getFlareSolverrSession();
    try {
        const { content: listHtml } = await session.get(subUrl, { cookieJar: manager.cookieJar });
        const $ = load(listHtml);

        const threadList = $('tbody > tr')
            .toArray()
            .map((row) => {
                const $row = $(row);
                const a = $row.find('th a').first();
                if (!a.length) { return; }
                const href = a.attr('href') || '';
                const absHref = href.startsWith('http') ? href : new URL(href, rootUrl).href;
                const match = absHref.match(/tid=(\d+)/);
                const tid = match ? match[1] : undefined;
                const title = (a.text() || '').trim();
                const authorEl = $row.find('td.by cite a, td:nth-child(3) a').first();
                const author = authorEl.length ? (authorEl.text() || '').trim() : '';
                const pubEl = $row.find('td.by em a, td.by em span, td:nth-child(5) em a').first();
                const pubText = pubEl.length ? (pubEl.text() || '').trim() : '';
                if (!tid) { return; }
                return { tid, title, link: absHref, author, pubDate: parseDate(pubText) };
            })
            .filter((v) => v !== undefined);

        const items: DataItem[] = [];
        for (const item of threadList) {
            // eslint-disable-next-line no-await-in-loop
            const finalItem = (await cache.tryGet(item.tid, async () => {
                const { content: threadHtml } = await session.get(item.link, { cookieJar: manager.cookieJar });
                const $thread = load(threadHtml);
                let description = '';
                const contentEl = $thread('#postlist .t_f').first();
                const content = contentEl.html();
                if (content) {
                    description += renderDescription(content);
                }
                const firstImg = contentEl.find('img').first();
                const enclosureUrl = firstImg.length ? firstImg.attr('src') : undefined;
                return {
                    title: item.title, author: item.author, link: item.link,
                    description, pubDate: item.pubDate, guid: item.tid,
                    ...(enclosureUrl ? { enclosure_url: enclosureUrl } : {}),
                } as DataItem;
            })) as DataItem;
            items.push(finalItem);
        }

        return {
            title: `${fid} - x1080x论坛`,
            link: `${rootUrl}/forum.php?mod=forumdisplay&fid=${fid}`,
            item: items,
        };
    } finally {
        await session.destroy();
    }
}

const renderDescription = (content: string): string =>
    renderToString(
        <span>{content}</span>
    );
```

## Pattern B: JSON API via FlareSolverr (zodgame)

The target site returns JSON from its mobile API, but is behind Cloudflare. FlareSolverr returns HTML wrapping the JSON body. Extract with `load(html)('body').text()`. Uses JSX `renderToString` for description rendering.

**Source:** `lib/routes/zodgame/forum.tsx`

```typescript
import { DataItem, Route } from '@/types';
import { getCurrentPath } from '@/utils/helpers';
const __dirname = getCurrentPath(import.meta.url);

import cache from '@/utils/cache';
import { parseDate } from '@/utils/parse-date';
import { renderToString } from 'hono/jsx/dom/server';
import path from 'node:path';
import { manager } from '@/utils/cookie-cloud';
import { getFlareSolverrSession } from '@/utils/flaresolverr';
import { config } from '@/config';
import { load } from 'cheerio';

const rootUrl = 'https://zodgame.xyz';

export const route: Route = {
    path: '/forum/:fid?',
    features: { requirePuppeteer: false, antiCrawler: true, nsfw: true },
    name: 'forum',
    maintainers: ['FeCCC'],
    handler,
};

async function handler(ctx) {
    await manager.initial(config.cookieCloud);
    const fid = ctx.req.param('fid');
    const subUrl = `${rootUrl}/api/mobile/index.php?version=4&module=forumdisplay&fid=${fid}&filter=author&orderby=dateline`;

    const session = await getFlareSolverrSession();
    try {
        const { content: listHtml } = await session.get(subUrl, { cookieJar: manager.cookieJar });
        const response = JSON.parse(load(listHtml)('body').text() || '{}');
        const info = response.Variables;

        const threadList = info.forum_threadlist
            .map((item) => {
                if (!info.threadtypes.types[item.typeid]) { return; }
                const type = info.threadtypes.types[item.typeid];
                return {
                    tid: item.tid,
                    title: `[${type}] ${item.subject}`,
                    author: item.author,
                    link: `${rootUrl}/forum.php?mod=viewthread&tid=${item.tid}&extra=page%3D1`,
                    category: type,
                    pubDate: parseDate(item.dbdateline * 1000),
                };
            })
            .filter((item) => item !== undefined);

        const items: DataItem[] = [];
        for (const item of threadList) {
            // eslint-disable-next-line no-await-in-loop
            const finalItem = (await cache.tryGet(item.tid, async () => {
                const url = `${rootUrl}/api/mobile/index.php?version=4&module=viewthread&tid=${item.tid}`;
                const { content: threadHtml } = await session.get(url, { cookieJar: manager.cookieJar });
                const threadResponse = JSON.parse(load(threadHtml)('body').text() || '{}');
                const threadInfo = threadResponse.Variables;
                let description = '';
                if (threadInfo?.thread?.freemessage) {
                    description += threadInfo.thread.freemessage;
                }
                if (threadInfo?.postlist) {
                    description += renderDescription(threadInfo.postlist[0].message);
                }
                return {
                    title: item.title, author: item.author, link: item.link,
                    description, category: item.category, pubDate: item.pubDate,
                    guid: item.tid,
                    upvotes: Number.parseInt(threadInfo?.thread?.recommend_add, 10),
                    downvotes: Number.parseInt(threadInfo?.thread?.recommend_sub, 10),
                    comments: Number.parseInt(threadInfo?.thread?.replies, 10),
                } as DataItem;
            })) as DataItem;
            items.push(finalItem);
        }

        return {
            title: `${info.forum.name} - ZodGame论坛`,
            link: `${rootUrl}/forum.php?mod=forumdisplay&fid=${fid}`,
            item: items,
        };
    } finally {
        await session.destroy();
    }
}

const renderDescription = (content: string): string =>
    renderToString(
        <>
            <br />
            <br />
            <span>{content}</span>
        </>
    );
```

## Pattern C: Converting Puppeteer to FlareSolverr (javdb)

When converting an existing Puppeteer-based route:

1. Replace `import { getPuppeteerPage } from '@/utils/puppeteer'` with `import { getFlareSolverrSession } from '@/utils/flaresolverr'`
2. Replace `const { page, destory } = await getPuppeteerPage(url, {...})` with `const session = await getFlareSolverrSession()`
3. Replace `await page.content()` with `session.get(url, { cookieJar: manager.cookieJar })` destructured as `{ content: html }`
4. Replace `load(await page.content())` with `load(html)` using cheerio
5. Replace `page.goto(url, ...)` + `page.content()` with another `session.get(url, ...)`
6. Replace `page.evaluate(() => JSON.parse(...))` with `JSON.parse(load(html)('body').text() || '{}')`
7. Remove all Puppeteer cookie-mapping boilerplate (the `cookieJar` option handles it)
8. Replace `await destory()` with `await session.destroy()` in `finally`
9. Set `requirePuppeteer: false` in route features
