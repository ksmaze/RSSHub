import { DataItem, Route } from '@/types';
import { getCurrentPath } from '@/utils/helpers';
const __dirname = getCurrentPath(import.meta.url);

import cache from '@/utils/cache';
import { parseDate } from '@/utils/parse-date';
import { art } from '@/utils/render';
import { manager } from '@/utils/cookie-cloud';
import path from 'node:path';
import { getFlareSolverrSession } from '@/utils/flaresolverr';
import { config } from '@/config';
import { load } from 'cheerio';

const rootUrl = 'https://x999x.me';

export const route: Route = {
    path: '/forum/:fid?',
    categories: ['bbs'],
    example: '/x1080x/forum/263',
    parameters: { fid: 'forum id, can be found in URL' },
    features: {
        requirePuppeteer: false,
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

    const session = await getFlareSolverrSession();
    try {
        const { content: listHtml } = await session.get(subUrl, { cookieJar: manager.cookieJar });
        const $ = load(listHtml);

        // example: <a href="https://x999x.me/forum.php?mod=viewthread&amp;tid=973225&amp;extra=page%3D1%26orderby%3Ddateline" onclick="atarget(this)" class="xst">[115](JAVPLAYER)ROE-353 父親再婚一個月後，繼母強迫我吃下含有催情劑的食物，吉永塔子[1V／MP4／9.3G]</a>
        // tid/title/link from above tag.
        // pubDate from document.querySelectorAll("tbody > tr > td:nth-child(5)")
        // example: <em><a>2023-10-3 02:23</a></em>
        const threadList = $('tbody > tr')
            .toArray()
            .map((row) => {
                const $row = $(row);
                const a = $row.find('th a').first();
                if (!a.length) {
                    return;
                }
                const href = a.attr('href') || '';
                const absHref = href.startsWith('http') ? href : new URL(href, rootUrl).href;
                const match = absHref.match(/tid=(\d+)/);
                const tid = match ? match[1] : undefined;
                const title = (a.text() || '').trim();
                const authorEl = $row.find('td.by cite a, td:nth-child(3) a, td.by cite, td:nth-child(3)').first();
                const author = authorEl.length ? (authorEl.text() || '').trim() : '';
                const pubEl = $row.find('td.by em a, td.by em span, td:nth-child(5) em a, td:nth-child(5) em, td:nth-child(5)').first();
                const pubText = pubEl.length ? (pubEl.text() || '').trim() : '';
                if (!tid) {
                    return;
                }
                return { tid, title, link: absHref, author, pubDate: parseDate(pubText) };
            })
            .filter((v) => v !== undefined);

        // fulltext
        const items: DataItem[] = [];
        for (const item of threadList) {
            // eslint-disable-next-line no-await-in-loop
            const finalItem = (await cache.tryGet(item.tid, async () => {
                const { content: threadHtml } = await session.get(item.link, { cookieJar: manager.cookieJar });
                const $thread = load(threadHtml);

                // Get thread description from page: #postlist .t_f
                // example: <td class="t_f" id="postmessage_2714423">【破解/調色/ED2K/Jav3.0D】ROE-353 父親再婚一個月後，繼母強迫我吃下含有催情劑的食物，吉永塔子【1V/9.28G/135分/1080P】<br></td>
                let description = '';
                const contentEl = $thread('#postlist .t_f').first();
                const content = contentEl.html();
                if (content) {
                    description += art(path.join(__dirname, 'templates/forum.art'), {
                        content,
                    });
                }
                const firstImg = contentEl.find('img').first();
                const enclosure_url = firstImg.length ? firstImg.attr('src') : undefined;

                return {
                    title: item.title,
                    author: item.author,
                    link: item.link,
                    description,
                    pubDate: item.pubDate,
                    guid: item.tid,
                    ...(enclosure_url ? { enclosure_url } : {}),
                } as DataItem;
            })) as DataItem;
            items.push(finalItem);
        }

        return {
            title: `${fid} - x1080x论坛`,
            link: `${rootUrl}/forum.php?mod=forumdisplay&fid=${fid}`,
            description: 'feedId:80392673247327232+userId:77884867866416128',
            item: items,
        };
    } finally {
        await session.destroy();
    }
}
