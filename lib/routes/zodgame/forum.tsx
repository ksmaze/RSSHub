import { load } from 'cheerio';
import { renderToString } from 'hono/jsx/dom/server';

import { config } from '@/config';
import type { DataItem, Route } from '@/types';
import cache from '@/utils/cache';
import { manager } from '@/utils/cookie-cloud';
import { getFlareSolverrSession } from '@/utils/flaresolverr';
import { parseDate } from '@/utils/parse-date';

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
        requirePuppeteer: false,
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

    const session = await getFlareSolverrSession();
    try {
        const { content: listHtml } = await session.get(subUrl, { cookieJar: manager.cookieJar });
        const response = JSON.parse(load(listHtml)('body').text() || '{}');
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
                const { content: threadHtml } = await session.get(url, { cookieJar: manager.cookieJar });
                const threadResponse = JSON.parse(load(threadHtml)('body').text() || '{}');

                const threadInfo = threadResponse.Variables;

                let description = '';

                if (!threadInfo?.thread) {
                    // console.log('missing thread response', item, threadResponse);
                }
                if (threadInfo?.thread?.freemessage) {
                    description += threadInfo.thread.freemessage;
                }
                if (threadInfo?.postlist) {
                    description += renderDescription(threadInfo.postlist[0].message);
                }

                const $desc = load(description);
                const firstImg = $desc('img').first();
                const enclosureUrl = firstImg.length ? firstImg.attr('src') : undefined;

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
                    ...(enclosureUrl ? { image: enclosureUrl } : {}),
                } as DataItem;
            })) as DataItem;
            items.push(finalItem);
        }

        return {
            title: `${info.forum.name} - ZodGame论坛`,
            link: `${rootUrl}/forum.php?mod=forumdisplay&fid=${fid}`,
            description: 'feedId:80392673247327232+userId:77884867866416128',
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
