import cache from '@/utils/cache';
import { load } from 'cheerio';
import { parseDate } from '@/utils/parse-date';
import { config } from '@/config';

import ConfigNotFoundError from '@/errors/types/config-not-found';
import { manager } from '@/utils/cookie-cloud';
import { DataItem } from '@/types';
import { getFlareSolverrSession } from '@/utils/flaresolverr';
import logger from '@/utils/logger';

const allowDomain = new Set(['javdb.com', 'javdb571.com', 'javdb36.com', 'javdb007.com', 'javdb521.com']);

const ProcessItems = async (ctx, currentUrl, title) => {
    await manager.initial(config.cookieCloud);
    const domain = ctx.req.query('domain') ?? 'javdb.com';
    const url = new URL(currentUrl, `https://${domain}`);
    if (!config.feature.allow_user_supply_unsafe_domain && !allowDomain.has(url.hostname)) {
        throw new ConfigNotFoundError(`This RSS is disabled unless 'ALLOW_USER_SUPPLY_UNSAFE_DOMAIN' is set to 'true'.`);
    }

    const rootUrl = `https://${domain}`;
    logger.info(`go to url: ${url.href}`);

    const session = await getFlareSolverrSession();
    try {
        const { content: listHtml } = await session.get(url.href, { cookieJar: manager.cookieJar });
        const $ = load(listHtml);

        $('.tags, .tag-can-play, .over18-modal').remove();

        const baseItems: DataItem[] = $('div.item')
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

        const htmlTitle = $('title').text();
        const subject = htmlTitle.includes('|') ? htmlTitle.split('|')[0] : '';

        const items: DataItem[] = [];
        for (const item of baseItems) {
            // eslint-disable-next-line no-await-in-loop
            const detailItem = (await cache.tryGet(item.link as string, async () => {
                const { content: detailHtml } = await session.get(item.link as string, { cookieJar: manager.cookieJar });
                const content = load(detailHtml);

                item.enclosure_type = 'application/x-bittorrent';
                item.enclosure_url = content('#magnets-content button[data-clipboard-text]').first().attr('data-clipboard-text');

                content('icon').remove();
                content('#modal-review-watched, #modal-comment-warning, #modal-save-list').remove();
                content('.review-buttons, .copy-to-clipboard, .preview-video-container, .play-button').remove();

                content('.preview-images img').each((_, el) => {
                    content(el).removeAttr('data-src');
                    content(el).attr('src', content(el).parent().attr('href'));
                });

                item.category = content('.panel-block .value a')
                    .toArray()
                    .map((v) => content(v).text());
                item.author = content('.panel-block .value').last().parent().find('.value a').first().text();
                item.description = [content('.cover-container, .column-video-cover').html(), content('.movie-panel-info').html(), content('#magnets-content').html(), content('.preview-images').html()].join('');

                return item;
            })) as DataItem;
            items.push(detailItem);
        }

        return {
            title: subject === '' ? title : `${subject} - ${title}`,
            link: url.href,
            item: items,
        };
    } catch (error) {
        logger.error(`Error while processing JavDB route ${url.href}`, error);
        throw error;
    } finally {
        await session.destroy();
    }
};

export default { ProcessItems };
