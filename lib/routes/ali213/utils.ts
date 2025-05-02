import type { DataItem } from '@/types';

import ofetch from '@/utils/ofetch';
import { load } from 'cheerio';
import cache from '@/utils/cache';

interface idNameMap {
    type: string;
    name: string;
    navId: string;
    suffix?: string;
}

export const getArticleList = async (navId) => {
    const response = await ofetch(`https://newapi.ali213.net/app/v1/recommendList?navId=${navId}&pageNum=20&pageNo=1&confirmNo=31`);

    return response.data.list;
};

export const parseArticleList = (list: any[]) =>
    list
        .map((item) => {
            const title = item.label;
            const id = item.jumpUrl;
            const link = `https://3g.ali213.net/news/html/${id}.html`;
            const pubDate = new Date(Number.parseInt(item.createTime) * 1000);
            const image = item.pic?.[0];
            return {
                title,
                id,
                link,
                image,
                pubDate,
            };
        })
        .filter((item) => item !== undefined) satisfies DataItem[];

export const getArticle = (item) => {
    const link = `https://3g.ali213.net/app/news/newsdetailV?v=1&id=${item.id}&token=`;
    return cache.tryGet(link, async () => {
        const response = await ofetch(link, { parseResponse: JSON.parse });
        const $ = load(response.Content);
        const content = $.root();
        // content.find('.appGameBuyCardIframe, .GSAppButton, .Mid2L_down').remove();
        content.find('a').each((_, item) => {
            if (item.attribs.href === 'javascript:void(0);') {
                item.attribs.href = '';
            }
        });
        content.find('img').each((_, item) => {
            item.attribs.src = item.attribs['data-original'];
        });
        item.description = content.html();
        return item satisfies DataItem;
    }) as Promise<DataItem>;
};

export const mdTableBuilder = (data: idNameMap[]) => {
    const table = '|' + data.map((item) => `${item.type}|`).join('') + '\n|' + Array.from({ length: data.length }).fill('---|').join('') + '\n|' + data.map((item) => `${item.name}|`).join('') + '\n';
    return table;
};
