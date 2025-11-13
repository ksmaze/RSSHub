import { DataItem, Route } from '@/types';
import { getCurrentPath } from '@/utils/helpers';
const __dirname = getCurrentPath(import.meta.url);

import cache from '@/utils/cache';
import { parseDate } from '@/utils/parse-date';
import { art } from '@/utils/render';
import { manager } from '@/utils/cookie-cloud';
import path from 'node:path';
import { getPuppeteerPage } from '@/utils/puppeteer';
import { config } from '@/config';

const rootUrl = 'https://x999x.me';

export const route: Route = {
    path: '/forum/:fid?',
    categories: ['bbs'],
    example: '/x1080x/forum/263',
    parameters: { fid: 'forum id, can be found in URL' },
    features: {
        requirePuppeteer: true,
        antiCrawler: true,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
        nsfw: true,
    },
    name: 'forum',
    maintainers: ['ksmaze'],
    handler,
};

async function handler(ctx) {
    await manager.initial(config.cookieCloud);
    const fid = ctx.req.param('fid');
    const subUrl = `${rootUrl}/forum.php?mod=forumdisplay&fid=${fid}&orderby=dateline`;

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

    await page.waitForSelector('tbody > tr > th > a', { timeout: 8000 });

    // example: <a href="https://x999x.me/forum.php?mod=viewthread&amp;tid=973225&amp;extra=page%3D1%26orderby%3Ddateline" onclick="atarget(this)" class="xst">[115](JAVPLAYER)ROE-353 父親再婚一個月後，繼母強迫我吃下含有催情劑的食物，吉永塔子[1V／MP4／9.3G]</a>
    // tid/title/link from above tag.
    // pubDate from document.querySelectorAll("tbody > tr > td:nth-child(5)")
    // example: <em><a>2023-10-3 02:23</a></em>
    const threadList = await page.$$eval('tbody > tr', (rows) =>
        rows
            .map((row) => {
                const a = row.querySelector('th a');
                if (!a) {
                    return;
                }
                const href = a.getAttribute('href') || '';
                const absHref = href.startsWith('http') ? href : new URL(href, window.location.origin).href;
                const match = absHref.match(/tid=(\d+)/);
                const tid = match ? match[1] : undefined;
                const title = (a.textContent || '').trim();
                const authorEl = row.querySelector('td.by cite a') || row.querySelector('td:nth-child(3) a') || row.querySelector('td.by cite') || row.querySelector('td:nth-child(3)');
                const author = authorEl ? (authorEl.textContent || '').trim() : '';
                const pubEl = row.querySelector('td.by em a') || row.querySelector('td.by em span') || row.querySelector('td:nth-child(5) em a') || row.querySelector('td:nth-child(5) em') || row.querySelector('td:nth-child(5)');
                const pubText = pubEl ? (pubEl.textContent || '').trim() : '';
                if (!tid) {
                    return;
                }
                return { tid, title, link: absHref, author, pubDate: parseDate(pubText) };
            })
            .filter((v) => v !== undefined)
    );

    // fulltext
    const items: DataItem[] = [];
    for (const item of threadList) {
        // eslint-disable-next-line no-await-in-loop
        const finalItem = (await cache.tryGet(item.tid, async () => {
            await page.goto(item.link, { waitUntil: 'domcontentloaded' });

            // Get thread description from page: document.querySelectorAll("#postlist .t_f")
            // example: <td class="t_f" id="postmessage_2714423">【破解/調色/ED2K/Jav3.0D】ROE-353 父親再婚一個月後，繼母強迫我吃下含有催情劑的食物，吉永塔子【1V/9.28G/135分/1080P】<br></td>
            let description = '';
            await page.waitForSelector('#postlist .t_f', { timeout: 15000 });
            const content = await page.$eval('#postlist .t_f', (el: any) => el.innerHTML);
            if (content) {
                description += art(path.join(__dirname, 'templates/forum.art'), {
                    content,
                });
            }

            return {
                title: item.title,
                author: item.author,
                link: item.link,
                description,
                pubDate: item.pubDate,
                guid: item.tid,
            } as DataItem;
        })) as DataItem;
        items.push(finalItem);
    }

    await destory();

    return {
        title: `${fid} - x1080x论坛`,
        link: `${rootUrl}/forum.php?mod=forumdisplay&fid=${fid}`,
        description: 'feedId:80392673247327232+userId:77884867866416128',
        item: items,
    };
}
