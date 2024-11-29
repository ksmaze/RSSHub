import type { Route } from '@/types';
import type { Context } from 'hono';
import { getArticleList, parseArticleList, getArticle, mdTableBuilder } from './utils';

const idNameMap = [
    {
        type: 'today',
        name: '推荐',
        navId: '1',
    },
    {
        type: 'game',
        name: '游戏',
        navId: '2',
    },
    {
        type: 'tech',
        name: '科技',
        navId: '67689',
    },
];

export const route: Route = {
    path: '/news/:type?',
    categories: ['game'],
    example: '/ali213/news/today',
    parameters: {
        type: '资讯类型，见表，默认为 `today`',
    },
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        {
            source: ['www.ali213.net/news'],
            target: '/news',
        },
    ],
    name: '资讯',
    maintainers: ['ksmaze'],
    description: mdTableBuilder(idNameMap),
    handler,
};

async function handler(ctx: Context) {
    const type = ctx.req.param('type') ?? 'today';
    const idName = idNameMap.find((item) => item.type === type);
    if (!idName) {
        throw new Error(`Invalid type: ${type}`);
    }

    const response = await getArticleList(idName.navId);
    const list = parseArticleList(response);
    const fullTextList = await Promise.all(list.map((item) => getArticle(item)));
    return {
        title: `游侠网 - ${idName.name}`,
        link: 'https://www.ali213.net/news/',
        item: fullTextList,
    };
}
