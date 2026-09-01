import { load } from 'cheerio';

import { config } from '@/config';
import type { DataItem, Route } from '@/types';
import { ViewType } from '@/types';
import cache from '@/utils/cache';
import { manager } from '@/utils/cookie-cloud';
import ofetch from '@/utils/ofetch';
import { parseDate } from '@/utils/parse-date';

export const route: Route = {
    path: '/podcast/:id',
    categories: ['multimedia'],
    view: ViewType.Audios,
    example: '/xiaoyuzhou/podcast/6021f949a789fca4eff4492c',
    parameters: { id: '播客 id 或单集 id，可以在小宇宙播客的 URL 中找到' },
    features: {
        requireConfig: [
            {
                name: 'COOKIE_CLOUD_HOST',
                optional: true,
                description: 'CookieCloud 服务地址，配合 COOKIE_CLOUD_UUID / COOKIE_CLOUD_PASSWORD 同步小宇宙登录 cookie，用于解锁已购买的付费单集',
            },
        ],
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        {
            source: ['xiaoyuzhoufm.com/podcast/:id', 'xiaoyuzhoufm.com/episode/:id'],
        },
    ],
    name: '播客',
    maintainers: ['hondajojo', 'jtsang4', 'pseudoyu', 'cscnk52'],
    handler,
    url: 'xiaoyuzhoufm.com/',
};

const baseUrl = 'https://www.xiaoyuzhoufm.com';

const isPaidEpisode = (episode) => episode.payType === 'PAY_EPISODE' || Boolean(episode.product);

const decorateTitle = (episode) => {
    if (!isPaidEpisode(episode)) {
        return episode.title;
    }
    return `${episode.title}${episode.isOwned ? '[已付]' : '[付费]'}`;
};

const getEnclosureUrl = (episode) => {
    if (isPaidEpisode(episode) && !episode.isOwned && episode.trial?.segment) {
        return episode.trial.segment;
    }
    return episode.enclosure?.url;
};

async function handler(ctx) {
    await manager.initial(config.cookieCloud);
    const cookie = await manager.cookieJar.getCookieString(baseUrl);
    const fetchOptions = cookie ? { headers: { cookie } } : {};

    const id = ctx.req.param('id');
    let link;
    let response;
    let $;
    let page_data;

    // First try podcast URL, if that fails try episode URL
    try {
        link = `${baseUrl}/podcast/${id}`;
        response = await ofetch(link, fetchOptions);

        $ = load(response);
        const nextDataElement = $('#__NEXT_DATA__').get(0);
        page_data = JSON.parse(nextDataElement.children[0].data);

        // If no episodes found, we should try episode URL
        if (!page_data.props.pageProps.podcast?.episodes) {
            throw new Error('No episodes found in podcast data');
        }
    } catch {
        // Try as episode instead
        link = `${baseUrl}/episode/${id}`;
        response = await ofetch(link, fetchOptions);

        $ = load(response);
        const podcastLink = $('a[href^="/podcast/"].name').attr('href');

        if (podcastLink) {
            const podcastId = podcastLink.split('/').pop();
            link = `${baseUrl}/podcast/${podcastId}`;
            response = await ofetch(link, fetchOptions);

            $ = load(response);
            const nextDataElement = $('#__NEXT_DATA__').get(0);
            page_data = JSON.parse(nextDataElement.children[0].data);
        }
    }

    let episodes = page_data.props.pageProps.podcast.episodes.map((item) => ({
        title: decorateTitle(item),
        enclosure_url: getEnclosureUrl(item),
        itunes_duration: item.duration,
        enclosure_type: item.media?.mimeType || 'audio/mpeg',
        link: `${baseUrl}/episode/${item.eid}`,
        eid: item.eid,
        pubDate: parseDate(item.pubDate),
        itunes_item_image: (item.image || item.podcast?.image)?.smallPicUrl,
    }));

    episodes = await Promise.all(
        episodes.map((item) =>
            cache.tryGet(item.link, async () => {
                const episodeLink = `${baseUrl}/_next/data/${page_data.buildId}/episode/${item.eid}.json`;
                const response = await ofetch(episodeLink, fetchOptions);
                const episodeItem = response.pageProps.episode;
                item.title = decorateTitle(episodeItem);
                item.enclosure_url = getEnclosureUrl(episodeItem);
                item.enclosure_type = episodeItem.media?.mimeType || item.enclosure_type;
                item.description = episodeItem.shownotes || episodeItem.description || episodeItem.title || '';
                return item as DataItem;
            })
        )
    );

    return {
        title: page_data.props.pageProps.podcast.title,
        link: `${baseUrl}/podcast/${page_data.props.pageProps.podcast.pid}`,
        itunes_author: page_data.props.pageProps.podcast.author,
        itunes_category: '',
        image: page_data.props.pageProps.podcast.image.smallPicUrl,
        item: episodes,
        description: page_data.props.pageProps.podcast.description,
    };
}
