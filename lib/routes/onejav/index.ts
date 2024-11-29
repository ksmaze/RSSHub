import { Route } from '@/types';
import { load } from 'cheerio';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';

export const route: Route = {
    path: '/:query{.*}?',
    radar: [
        {
            source: ['onejav.com'],
        },
    ],
    name: 'OneJAV',
    description: 'feedId:79735583546357760+userId:77884867866416128',
    parameters: { query: '' },
    maintainers: ['ksmaze'],
    handler,
    url: 'onejav.com/',
    example: 'popular',
};

async function handler(ctx) {
    const query = ctx.req.param('query') ?? '';
    const rootUrl = 'https://onejav.com';
    const urlObj = new URL(rootUrl);
    urlObj.pathname = query;
    const url = urlObj.toString();
    const response = await got({
        method: 'get',
        url,
    });

    const $ = load(response.data);
    const items = $('div.container > div.card')
        .toArray()
        .map((item) => {
            const item2 = $(item);
            return {
                title: item2.find('h5.title').text(),
                link: `${rootUrl}${item2.find('h5.title > a').attr('href')}`,
                description: item2.find('p.level').text(),
                pubDate: parseDate(item2.find('p.subtitle').text()),
                image: item2.find('img.image').attr('src'),
            };
        });

    return {
        title: `OneJAV - ${query}`,
        description: 'feedId:79735583546357760+userId:77884867866416128',
        link: url,
        item: items,
    };
}
