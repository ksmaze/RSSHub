import { DataItem, Route } from '@/types';
import cache from '@/utils/cache';
import got from '@/utils/got';
import { load } from 'cheerio';
import Parser from 'rss-parser';

const categories = {
    av: '2_2',
    games: '1_3',
    anime: '1_1',
};

export const route: Route = {
    path: '/:category?/:query?',
    radar: [
        {
            source: ['sukebei.nyaa.si'],
        },
    ],
    name: 'Sukebei',
    description: 'feedId:79735583546357760+userId:77884867866416128',
    parameters: { category: 'av/games/anime`', query: '' },
    maintainers: ['ksmaze'],
    handler,
    url: 'sukebei.nyaa.si/',
    example: 'sukebei/av/破壊版',
};

async function handler(ctx) {
    const category = ctx.req.param('category') ?? 'av';
    const query = ctx.req.param('query') ?? '';
    const c = categories[category] ?? '0_0';
    const urlObj = new URL('https://sukebei.nyaa.si/?page=rss&f=0');
    urlObj.searchParams.set('c', c);
    urlObj.searchParams.set('q', query);
    const url = urlObj.toString();
    const parser = new Parser();
    const response = await got({
        method: 'get',
        url,
    });

    const parsed = await parser.parseString(response.data);

    const items: DataItem[] = parsed.items
        .map((item) => {
            const guid = item.guid?.split('/')?.at(-1);
            return {
                guid,
                title: item.title ?? '',
                link: item.guid,
                description: item.content,
                pubDate: item.pubDate,
            };
        })
        .filter((item) => item !== undefined)
        .slice(0, 50) satisfies DataItem[];

    for (const item of items) {
        try {
            // eslint-disable-next-line no-await-in-loop
            const html = await cache.tryGet(item.link || '', async () => {
                const detailResponse = await got({ method: 'get', url: item.link });
                return detailResponse.data as string;
            });
            const descMatch = html?.match(/id="torrent-description">([\s\S]*?)<\/div>/);
            if (descMatch) {
                const urls = descMatch[1].match(/https?:\/\/imagetwist\.com\/[\w-]+\/[\w\-_]+\.jpg/g) || [];
                if (urls.length > 0) {
                    const href = urls[0];
                    // eslint-disable-next-line no-await-in-loop
                    const page = await cache.tryGet(href, async () => {
                        const detailResponse = await got({ method: 'get', url: href });
                        return detailResponse.data as string;
                    });
                    if (page === null) {
                        continue;
                    }
                    const $ = load(page as string);
                    const content = $.root();
                    const imgMatch = content.find('img.img-responsive').attr('src');
                    if (imgMatch) {
                        item.image = imgMatch;
                        item.description = `<img src="${imgMatch}">`;
                    }
                }
            }
        } catch (error) {
            // ignore errors
            // eslint-disable-next-line no-console
            console.log(error);
        }
    }

    return {
        title: `Sukebei -${category} - ${query}`,
        description: 'feedId:79735583546357760+userId:77884867866416128',
        link: url,
        item: items,
    };
}
