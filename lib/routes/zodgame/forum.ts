import { DataItem, Route } from '@/types';
import { getCurrentPath } from '@/utils/helpers';
const __dirname = getCurrentPath(import.meta.url);

import cache from '@/utils/cache';
import { parseDate } from '@/utils/parse-date';
import { art } from '@/utils/render';
import path from 'node:path';
import { manager } from '@/utils/cookie-cloud';
import { getPuppeteerPage } from '@/utils/puppeteer';
import { config } from '@/config';

const rootUrl = 'https://zodgame.xyz';

export const route: Route = {
    path: '/forum/:fid?',
    categories: ['bbs'],
    example: '/zodgame/forum/13',
    parameters: { fid: 'forum id, can be found in URL' },
    features: {
        requireConfig: [
            {
                name: 'ZODGAME_COOKIE',
                description: '',
            },
        ],
        requirePuppeteer: true,
        antiCrawler: true,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
        nsfw: true,
    },
    name: 'forum',
    maintainers: ['FeCCC'],
    description: 'feedId:80392673247327232+userId:77884867866416128',
    handler,
};

async function handler(ctx) {
    await manager.initial(config.cookieCloud);
    const fid = ctx.req.param('fid');
    const subUrl = `${rootUrl}/api/mobile/index.php?version=4&module=forumdisplay&fid=${fid}&filter=author&orderby=dateline`;

    const { page, destory } = await getPuppeteerPage(subUrl, {
        gotoConfig: { waitUntil: 'domcontentloaded' },
        onBeforeLoad: async (page, browser): Promise<void> => {
            const toughCookies = manager.cookieJar.getCookiesSync(rootUrl);
            const puppeteerCookies = toughCookies.map((c: any) => {
                const sameSiteRaw = c.sameSite;
                const sameSite = typeof sameSiteRaw === 'string' ? sameSiteRaw.charAt(0).toUpperCase() + sameSiteRaw.slice(1).toLowerCase() : undefined;
                const cookie: any = {
                    name: c.key,
                    value: c.value,
                    url: rootUrl,
                    path: c.path || '/',
                    httpOnly: c.httpOnly,
                    secure: c.secure,
                };
                if (sameSite === 'Lax' || sameSite === 'Strict' || sameSite === 'None') {
                    cookie.sameSite = sameSite;
                }
                if (c.expires && typeof c.expires.getTime === 'function') {
                    const expires = Math.floor(c.expires.getTime() / 1000);
                    if (Number.isFinite(expires) && expires > 0) {
                        cookie.expires = expires;
                    }
                }
                return cookie;
            });
            if (puppeteerCookies.length) {
                await browser?.setCookie(...puppeteerCookies);
            }
        },
    });

    const response = await page.evaluate(() =>
        // Assuming the JSON is directly within the body's innerText
        // or within a specific element, e.g., document.querySelector('#data').innerText
         JSON.parse(document.querySelector('body')?.textContent || '{}')
    );
    const info = response.Variables;

    const threadList = info.forum_threadlist
        .map((item) => {
            if (!info.threadtypes.types[item.typeid]) {
                return;
            }
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

    // fulltext
    const items: DataItem[] = [];
    for (const item of threadList) {
        // eslint-disable-next-line no-await-in-loop
        const finalItem = (await cache.tryGet(item.tid, async () => {
            const url = `${rootUrl}/api/mobile/index.php?version=4&module=viewthread&tid=${item.tid}`;
            await page.goto(url, { waitUntil: 'domcontentloaded' });
            const threadResponse = await page.evaluate(() =>
                // Assuming the JSON is directly within the body's innerText
                // or within a specific element, e.g., document.querySelector('#data').innerText
                 JSON.parse(document.querySelector('body')?.textContent || '{}')
            );

            const threadInfo = threadResponse.Variables;

            let description = '';

            if (!threadInfo?.thread) {
                // console.log('missing thread response', item, threadResponse);
            }
            if (threadInfo?.thread?.freemessage) {
                description += threadInfo.thread.freemessage;
            }
            if (threadInfo?.postlist) {
                description += art(path.join(__dirname, 'templates/forum.art'), {
                    content: threadInfo.postlist[0].message,
                });
            }

            return {
                title: item.title,
                author: item.author,
                link: item.link,
                description,
                category: item.category,
                pubDate: item.pubDate,
                guid: item.tid,
                upvotes: Number.parseInt(threadInfo?.thread?.recommend_add, 10),
                downvotes: Number.parseInt(threadInfo?.thread?.recommend_sub, 10),
                comments: Number.parseInt(threadInfo?.thread?.replies, 10),
            } as DataItem;
        })) as DataItem;
        items.push(finalItem);
    }

    await destory();

    return {
        title: `${info.forum.name} - ZodGame论坛`,
        link: `${rootUrl}/forum.php?mod=forumdisplay&fid=${fid}`,
        description: 'feedId:80392673247327232+userId:77884867866416128',
        item: items,
    };
}
