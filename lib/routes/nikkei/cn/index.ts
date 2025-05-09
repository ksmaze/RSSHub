import { Route } from '@/types';
import { getSubPath } from '@/utils/common-utils';
import cache from '@/utils/cache';
import got from '@/utils/got';
import { load } from 'cheerio';
import timezone from '@/utils/timezone';
import { parseDate } from '@/utils/parse-date';
import { config } from '@/config';
import Parser from 'rss-parser';

const parser = new Parser({
    customFields: {
        item: ['magnet'],
    },
    headers: {
        'User-Agent': config.ua,
    },
    defaultRSS: 0.9,
});

export const route: Route = {
    path: '/cn/*',
    name: '中文版新闻',
    example: '/nikkei/cn',
    maintainers: ['nczitzk'],
    handler,
    description: `::: tip
  如 [中国 经济 日经中文网](https://cn.nikkei.com/china/ceconomy.html) 的 URL 为 \`https://cn.nikkei.com/china/ceconomy.html\` 对应路由为 [\`/nikkei/cn/cn/china/ceconomy\`](https://rsshub.app/nikkei/cn/cn/china/ceconomy)

  如 [中國 經濟 日經中文網](https://zh.cn.nikkei.com/china/ceconomy.html) 的 URL 为 \`https://zh.cn.nikkei.com/china/ceconomy.html\` 对应路由为 [\`/nikkei/cn/zh/china/ceconomy\`](https://rsshub.app/nikkei/cn/zh/china/ceconomy)

  特别地，当 \`path\` 填入 \`rss\` 后（如路由为 [\`/nikkei/cn/cn/rss\`](https://rsshub.app/nikkei/cn/cn/rss)），此时返回的是 [官方 RSS 的内容](https://cn.nikkei.com/rss.html)
:::`,
    radar: [
        {
            title: '中文版新闻',
            source: ['cn.nikkei.com/:category/:type', 'cn.nikkei.com/:category', 'cn.nikkei.com/'],
            target: (params) => {
                if (params.category && params.type) {
                    return `/nikkei/cn/cn/${params.category}/${params.type.replace('.html', '')}`;
                } else if (params.category && !params.type) {
                    return `/nikkei/cn/cn/${params.category.replace('.html', '')}`;
                } else {
                    return `/nikkei/cn/cn`;
                }
            },
        },
        {
            title: '中文版新聞',
            source: ['zh.cn.nikkei.com/:category/:type', 'zh.cn.nikkei.com/:category', 'zh.cn.nikkei.com/'],
            target: (params) => {
                if (params.category && params.type) {
                    return `/nikkei/cn/zh/${params.category}/${params.type.replace('.html', '')}`;
                } else if (params.category && !params.type) {
                    return `/nikkei/cn/zh/${params.category.replace('.html', '')}`;
                } else {
                    return `/nikkei/cn/zh`;
                }
            },
        },
    ],
};

async function handler(ctx) {
    let language = '';
    let path = getSubPath(ctx);

    if (/^\/cn\/(cn|zh)/.test(path)) {
        language = path.match(/^\/cn\/(cn|zh)/)[1];
        path = path.match(new RegExp(String.raw`\/cn\/` + language + '(.*)'))[1];
    } else {
        language = 'cn';
    }

    const limit = ctx.req.query('limit') ? Number.parseInt(ctx.req.query('limit')) : 25;

    const rootUrl = `https://${language === 'zh' ? 'zh.' : ''}cn.nikkei.com`;
    const isOfficialRSS = path === '/rss';
    const currentUrl = `${rootUrl}${path}${isOfficialRSS ? '.html' : ''}`;

    let officialFeed;

    let items = [],
        $;

    if (isOfficialRSS) {
        officialFeed = await parser.parseURL(currentUrl);
        items = officialFeed.items.slice(0, limit).map((item) => ({
            title: item.title,
            link: new URL(item.link, rootUrl).href,
        }));
    } else {
        const response = await got({
            method: 'get',
            url: currentUrl,
        });

        $ = load(response.data);

        const seenLinks = new Set<string>();
        items = $('dt a')
            .toArray()
            .map((item) => {
                item = $(item);

                return {
                    title: item.text(),
                    link: new URL(item.attr('href'), currentUrl).href,
                };
            })
            .filter((item) => {
                if (seenLinks.has(item.link)) {
                    return false;
                }
                seenLinks.add(item.link);
                return true;
            })
            .slice(0, limit);
    }

    items = await Promise.all(
        items.map((item) =>
            cache.tryGet(item.link, async () => {
                const detailResponse = await got({
                    method: 'get',
                    url: `${item.link}?print=1`,
                });

                const content = load(detailResponse.data);

                const divs = content('#contentDiv div');
                divs.first().remove();
                divs.last().remove();

                item.pubDate = timezone(parseDate(item.link.match(/\/\d+-(.*?)\.html/)[1], 'YYYY-MM-DD-HH-mm-ss'), +9);

                item.author = content('meta[name="author"]').attr('content');
                item.title = item.title ?? content('meta[name="twitter:title"]').attr('content');
                item.description = content('#contentDiv')
                    .html()
                    ?.replace(/&nbsp;/g, '')
                    .replaceAll('<p></p>', '');

                return item;
            })
        )
    );

    return {
        title: isOfficialRSS ? officialFeed.title : $('title').first().text(),
        description: isOfficialRSS ? officialFeed.description : '',
        link: currentUrl,
        item: items,
    };
}
