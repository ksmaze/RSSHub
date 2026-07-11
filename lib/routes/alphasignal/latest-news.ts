import { load } from 'cheerio';

import { config } from '@/config';
import { type Data, type DataItem, type Route, ViewType } from '@/types';
import { manager } from '@/utils/cookie-cloud';
import { getFlareSolverrSession } from '@/utils/flaresolverr';
import ofetch from '@/utils/ofetch';
import { parseDate } from '@/utils/parse-date';

const rootUrl = 'https://alphasignal.ai';
const currentUrl = `${rootUrl}/news`;
const sessionUrl = `${rootUrl}/api/auth/session`;
const apiUrl = 'https://api.alphasignal.ai/api/news';

interface SessionResponse {
    user?: {
        token?: string;
    };
}

interface NewsItem {
    news_id: string;
    title: string;
    subtitle?: string;
    regular_categories?: string[];
    advanced_categories?: string[];
    content_type?: string;
    name?: string;
    alphasignal_image?: string;
    video_url?: string;
    publish_time?: string;
    slug?: string;
}

interface NewsResponse {
    success: boolean;
    data?: {
        data?: NewsItem[];
    };
}

const parseNewsItem = (item: NewsItem): DataItem => {
    const categories = [...(item.regular_categories ?? []), ...(item.advanced_categories ?? []), ...(item.content_type ? [item.content_type] : [])];

    return {
        title: item.title,
        link: item.slug ? `${currentUrl}/${item.slug}` : `${currentUrl}/${item.news_id}`,
        description: item.subtitle,
        pubDate: item.publish_time ? parseDate(item.publish_time) : undefined,
        author: item.name,
        category: [...new Set(categories)],
        guid: item.news_id,
        image: item.alphasignal_image,
        enclosure_url: item.video_url,
        enclosure_type: item.video_url ? 'video/mp4' : undefined,
    };
};

export const handler = async (): Promise<Data> => {
    await manager.initial(config.cookieCloud);

    const session = await getFlareSolverrSession();
    let sessionResponse: SessionResponse;

    try {
        const { content } = await session.get(sessionUrl, { cookieJar: manager.cookieJar });
        sessionResponse = JSON.parse(load(content)('body').text() || '{}');
    } finally {
        await session.destroy();
    }

    const token = sessionResponse.user?.token;
    if (!token) {
        throw new Error('AlphaSignal authentication failed. Ensure CookieCloud contains valid logged-in cookies for alphasignal.ai.');
    }

    const response = await ofetch<NewsResponse>(apiUrl, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            Origin: rootUrl,
        },
        body: {},
    });

    if (!response.success || !response.data?.data) {
        throw new Error('AlphaSignal news API returned an invalid response. The account token may have expired.');
    }

    return {
        title: 'AlphaSignal - Latest News',
        description: 'The Best of Machine Learning, Summarized by AI.',
        link: currentUrl,
        item: response.data.data.map(parseNewsItem),
    };
};

export const route: Route = {
    path: '/latest-news',
    name: 'Latest News',
    url: 'alphasignal.ai/news',
    maintainers: [],
    handler,
    example: '/alphasignal/latest-news',
    parameters: undefined,
    description: 'Get the latest AlphaSignal news using a logged-in account from CookieCloud.',
    categories: ['programming'],
    features: {
        requireConfig: [
            {
                name: 'COOKIE_CLOUD_HOST',
                description: 'CookieCloud server URL',
            },
            {
                name: 'COOKIE_CLOUD_UUID',
                description: 'CookieCloud UUID',
            },
            {
                name: 'COOKIE_CLOUD_PASSWORD',
                description: 'CookieCloud password',
            },
            {
                name: 'FLARESOLVERR_URL',
                description: 'FlareSolverr server URL',
            },
        ],
        requirePuppeteer: false,
        antiCrawler: true,
        supportRadar: true,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        {
            source: ['alphasignal.ai/news'],
            target: '/latest-news',
        },
    ],
    view: ViewType.Articles,
};
