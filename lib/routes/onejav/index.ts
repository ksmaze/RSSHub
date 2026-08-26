import { load } from 'cheerio';
import type { Context } from 'hono';

import type { DataItem, Route } from '@/types';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';

export const route: Route = {
    path: '/:query{.*}?',
    categories: ['multimedia'],
    example: '/onejav/popular',
    radar: [
        {
            source: ['onejav.com'],
        },
    ],
    name: 'General',
    description: 'OneJAV torrent feed',
    parameters: { query: 'URL path, e.g. popular, new, tag/...' },
    maintainers: ['ksmaze'],
    handler,
    url: 'onejav.com',
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportRadar: true,
        supportBT: true,
        supportPodcast: false,
        supportScihub: false,
        nsfw: true,
    },
};

async function handler(ctx: Context) {
    const query = ctx.req.param('query') ?? '';
    const rootUrl = 'https://onejav.com';
    const currentUrl = new URL(query, rootUrl).href;

    const { data } = await got({
        method: 'get',
        url: currentUrl,
    });

    const $ = load(data);
    const items: DataItem[] = $('.card.mb-3')
        .toArray()
        .map((item) => {
            const el = $(item);
            const code = el.find('h5.title a').text().trim();
            const level = el.find('p.level.has-text-grey-dark').text().trim();
            const title = level ? `${code} ${level}` : code;
            const link = new URL(el.find('h5.title a').attr('href') ?? '', rootUrl).href;
            const pubDateText = el.find('p.subtitle a').text().trim();
            const pubDate = pubDateText ? parseDate(pubDateText) : undefined;
            const image = el.find('img.image').attr('src');
            const category = el
                .find('.tags a.tag')
                .toArray()
                .map((tag) => $(tag).text().trim());
            const actresses = el
                .find('.panel a.panel-block')
                .toArray()
                .map((actress) => $(actress).text().trim());
            const torrent = el.find('a[title="Download .torrent"]').attr('href');
            const enclosureUrl = torrent ? new URL(torrent, rootUrl).href : undefined;

            return {
                title,
                link,
                pubDate,
                description: image ? `<img src="${new URL(image, rootUrl).href}" />` : level,
                author: actresses.length ? actresses.join(', ') : undefined,
                category,
                image: image ? new URL(image, rootUrl).href : undefined,
                enclosure_url: enclosureUrl,
                enclosure_type: enclosureUrl ? 'application/x-bittorrent' : undefined,
            };
        });

    return {
        title: `OneJAV - ${query || 'home'}`,
        description: 'OneJAV torrent feed',
        link: currentUrl,
        item: items,
    };
}
