import type { DataItem } from '@/types';

import ofetch from '@/utils/ofetch';
import { load } from 'cheerio';
import cache from '@/utils/cache';
import { parseDate } from '@/utils/parse-date';
import timezone from '@/utils/timezone';

interface idNameMap {
    type: string;
    name: string;
    nodeId: string;
    suffix?: string;
}
interface ArticleList {
    status: string;
    totalPages: number;
    body: string;
}

export const getArticleList = async (nodeId: string) => {
    const response = await ofetch<ArticleList>(
        `https://db2.gamersky.com/LabelJsonpAjax.aspx?${new URLSearchParams({
            jsondata: JSON.stringify({
                type: 'updatenodelabel',
                isCache: true,
                cacheTime: 60,
                nodeId,
                isNodeId: 'true',
                page: 1,
            }),
        })}`,
        {
            parseResponse: (txt) => JSON.parse(txt.match(/\((.+)\);/)?.[1] ?? '{}'),
        }
    );
    return response.body;
};

export const parseArticleList = (response: string) => {
    const $ = load(response);
    return $('li')
        .toArray()
        .map((item) => {
            const ele = $(item);
            const a = ele.find('.tt').length ? ele.find('.tt') : ele.find('a');
            const title = a.text();
            const link = a.attr('href');
            const pubDate = timezone(parseDate(ele.find('.time').text()), 8);
            const description = ele.find('.txt').text();
            if (!link) {
                return;
            }
            return {
                title,
                link,
                pubDate,
                description,
            };
        })
        .filter((item) => item !== undefined) satisfies DataItem[];
};

export const getArticle = (item) =>
    cache.tryGet(item.link, async () => {
        const response = await ofetch('https://router3.gamersky.com/@/postPage/index/6.16.40/0/App_Android', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
            },
            body: JSON.stringify({ postUrl: item.link }),
            parseResponse: JSON.parse,
        });
        const $ = load(response.post.contentInHtml);
        const content = $.root();
        content.find('.appGameBuyCardIframe, .GSAppButton, .Mid2L_down').remove();
        content.find('a').each((_, item) => {
            if (item.attribs.href === 'javascript:void(0);') {
                item.attribs.href = '';
            }
        });
        content.find('img').each((_, item) => {
            item.attribs.src = item.attribs.imageurl;
        });
        content.find('[style]').each((_, item) => {
            item.attribs.style = '';
        });
        item.description = content.html() || item.description;
        return item satisfies DataItem;
    }) as Promise<DataItem>;

export function mdTableBuilder(data: idNameMap[]) {
    const table = '|' + data.map((item) => `${item.type}|`).join('') + '\n|' + Array.from({ length: data.length }).fill('---|').join('') + '\n|' + data.map((item) => `${item.name}|`).join('') + '\n';
    return table;
}
