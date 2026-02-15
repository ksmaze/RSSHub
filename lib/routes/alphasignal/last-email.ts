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
