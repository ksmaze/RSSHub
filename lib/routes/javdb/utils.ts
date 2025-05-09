import cache from '@/utils/cache';
import got from '@/utils/got';
import { load } from 'cheerio';
import { parseDate } from '@/utils/parse-date';
import { config } from '@/config';

import ConfigNotFoundError from '@/errors/types/config-not-found';
import { manager } from '@/utils/cookie-cloud';
import { DataItem } from '@/types';

const allowDomain = new Set(['javdb.com', 'javdb36.com', 'javdb007.com', 'javdb521.com']);

const ProcessItems = async (ctx, currentUrl, title) => {
    await manager.initial(config.cookieCloud);
    const domain = ctx.req.query('domain') ?? 'javdb.com';
    const url = new URL(currentUrl, `https://${domain}`);
    if (!config.feature.allow_user_supply_unsafe_domain && !allowDomain.has(url.hostname)) {
        throw new ConfigNotFoundError(`This RSS is disabled unless 'ALLOW_USER_SUPPLY_UNSAFE_DOMAIN' is set to 'true'.`);
    }

    const rootUrl = `https://${domain}`;

    const response = await got({
        method: 'get',
        url: url.href,
        cookieJar: manager.cookieJar,
        headers: {
            'User-Agent': config.trueUA,
        },
    });

    const $ = load(response.data);

    $('.tags, .tag-can-play, .over18-modal').remove();

    let items: DataItem[] = $('div.item')
        .slice(0, ctx.req.query('limit') ? Number.parseInt(ctx.req.query('limit')) : 20)
        .toArray()
        .map((item) => {
            const item2 = $(item);
            return {
                title: item2.find('.video-title').text(),
                link: `${rootUrl}${item2.find('.box').attr('href')}`,
                pubDate: parseDate(item2.find('.meta').text()),
            };
        });

    items = (await Promise.all(
        items.map((item) =>
            cache.tryGet(item.link as string, async () => {
                const detailResponse = await got({
                    method: 'get',
                    url: item.link,
                    cookieJar: manager.cookieJar,
                    headers: {
                        'User-Agent': config.trueUA,
                    },
                });

                const content = load(detailResponse.data);

                item.enclosure_type = 'application/x-bittorrent';
                item.enclosure_url = content('#magnets-content button[data-clipboard-text]').first().attr('data-clipboard-text');

                content('icon').remove();
                content('#modal-review-watched, #modal-comment-warning, #modal-save-list').remove();
                content('.review-buttons, .copy-to-clipboard, .preview-video-container, .play-button').remove();

                content('.preview-images img').each(function () {
                    content(this).removeAttr('data-src');
                    content(this).attr('src', content(this).parent().attr('href'));
                });

                item.category = content('.panel-block .value a')
                    .toArray()
                    .map((v) => content(v).text());
                item.author = content('.panel-block .value').last().parent().find('.value a').first().text();
                item.description = [content('.cover-container, .column-video-cover').html(), content('.movie-panel-info').html(), content('#magnets-content').html(), content('.preview-images').html()].join('');

                return item;
            })
        )
    )) as DataItem[];

    const htmlTitle = $('title').text();
    const subject = htmlTitle.includes('|') ? htmlTitle.split('|')[0] : '';

    return {
        title: subject === '' ? title : `${subject} - ${title}`,
        link: url.href,
        item: items,
    };
};

export default { ProcessItems };
