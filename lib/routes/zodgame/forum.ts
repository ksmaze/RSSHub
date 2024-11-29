import { DataItem, Route } from '@/types';
import { getCurrentPath } from '@/utils/helpers';
const __dirname = getCurrentPath(import.meta.url);

import cache from '@/utils/cache';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';
import { art } from '@/utils/render';
import path from 'node:path';
import { manager } from '@/utils/cookie-cloud';
import { config } from '@/config';
import { JSDOM } from 'jsdom';

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
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
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

    const response = await got(subUrl, {
        method: 'get',
        cookieJar: manager.cookieJar,
        parseResponse: JSON.parse,
    });

    const info = response.data.Variables;

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
            const url = new URL(`${rootUrl}/api/mobile/index.php?version=4&module=viewthread&tid=${item.tid}`);
            let threadResponse = await got(url, {
                method: 'get',
                cookieJar: manager.cookieJar,
                parseResponse: JSON.parse,
            });

            if (typeof threadResponse.data === 'string' && threadResponse.data.startsWith('<script type="text/javascript">')) {
                const data = threadResponse.data;
                let script = data.match(/<script type="text\/javascript">([\S\s]*?)<\/script>/)![1];
                script = script.replaceAll('in()', 'funin()');
                script = script.replace(/= location;|=location;/, '=fakeLocation;');
                script = script.replace('location.replace', 'foo');
                script = script.replace('location.assign', 'foo');
                script = script.replace(/location\[[^\]]*]\(/, 'foo(');
                script = script.replace(/location\[[^\]]*]=/, 'window.locationValue=');
                script = script.replace('location.href=', 'window.locationValue=');
                script = script.replace('location=', 'window.locationValue=');
                const dom = new JSDOM(
                    `<script>
                function foo(value) { window.locationValue = value; };
                fakeLocation = { href: '', replace: foo, assign: foo };
                Object.defineProperty(fakeLocation, 'href', {
                    set: function (value) {
                        window.locationValue = value;
                    }
                });
                ${script}
            </script>`,
                    {
                        runScripts: 'dangerously',
                    }
                );
                const locationValue = dom.window.locationValue;
                if (locationValue) {
                    // console.log('locationValue', locationValue);
                    const searchParams = new URLSearchParams(locationValue);
                    const _dsign = searchParams.get('_dsign');
                    if (_dsign) {
                        url.searchParams.set('_dsign', _dsign);
                        threadResponse = await got(url, {
                            method: 'get',
                            cookieJar: manager.cookieJar,
                            parseResponse: JSON.parse,
                        });
                    }
                }
            }

            const threadInfo = threadResponse.data.Variables;

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

    return {
        title: `${info.forum.name} - ZodGame论坛`,
        link: `${rootUrl}/forum.php?mod=forumdisplay&fid=${fid}`,
        description: 'feedId:80392673247327232+userId:77884867866416128',
        item: items,
    };
}
