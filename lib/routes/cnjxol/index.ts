import { Route } from '@/types';

import cache from '@/utils/cache';
import got from '@/utils/got';
import { load } from 'cheerio';
import { parseDate } from '@/utils/parse-date';
import { art } from '@/utils/render';
import path from 'node:path';
import InvalidParameterError from '@/errors/types/invalid-parameter';

const categories = {
    jxrb: '嘉兴日报',
    nhwb: '南湖晚报',
};

export const route: Route = {
    path: '/:category?/:id?',
    name: 'Unknown',
    maintainers: [],
    handler,
};

async function handler(ctx) {
    const category = ctx.req.param('category') ?? 'jxrb';
    const id = ctx.req.param('id');
    if (!Object.keys(categories).includes(category)) {
        throw new InvalidParameterError('Invalid category');
    }

    const rootUrl = `https://${category}.cnjxol.com`;
    const currentUrl = `${rootUrl}/${category}Paper/pc/layout`;

    const response = await got({
        method: 'get',
        url: currentUrl,
    });

    let $ = load(response.data);
    const dateMatch = $('a')
        .first()
        .attr('href')
        .match(/\d{6}\/\d{2}/)[0];

    let items = [];

    if (id) {
        const pageUrl = `${currentUrl}/${dateMatch}/node_${id}.html`;

        const pageResponse = await got({
            method: 'get',
            url: pageUrl,
        });

        $ = load(pageResponse.data);

        items = $('#articlelist .clearfix a')
            .toArray()
            .map((a) => `${currentUrl}/${$(a).attr('href')}`.replaceAll('layout/../../../', ''));
    } else {
        await Promise.all(
            $('#list li a')
                .toArray()
                .map(async (p) => {
                    const pageResponse = await got({
                        method: 'get',
                        url: `${currentUrl}/${$(p).attr('href')}`,
                    });

                    const page = load(pageResponse.data);

                    items.push(
                        ...page('#articlelist .clearfix a')
                            .toArray()
                            .map((a) => `${currentUrl}/${page(a).attr('href')}`.replaceAll('layout/../../../', ''))
                    );
                })
        );
    }

    items = await Promise.all(
        items.map((item) =>
            cache.tryGet(item, async () => {
                const detailResponse = await got({
                    method: 'get',
                    url: item,
                });

                const content = load(detailResponse.data);

                return {
                    link: item,
                    title: content('#Title').text(),
                    pubDate: parseDate(content('date').text()),
                    description: art(path.join(__dirname, 'templates/description.art'), {
                        attachment: content('.attachment').html(),
                        content: content('founder-content').html(),
                    }),
                };
            })
        )
    );

    return {
        title: `${categories[category]}${id ? ` - ${$('#layout').text()}` : ''}`,
        link: currentUrl,
        item: items,
    };
}
