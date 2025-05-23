import cache from '@/utils/cache';
import md5 from '@/utils/md5';
import { load } from 'cheerio';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';

const dynamicTpye = { 0: '基本动态', 8: '酷图', 9: '评论', 10: '提问', 11: '回答', 12: '图文', 15: '二手', 17: '观点', 20: '交易动态' };

const getRandomDEVICE_ID = () => {
    const id = [10, 6, 6, 6, 14];
    const idStr = id.map((i) => Math.random().toString(36).slice(2, i));
    return idStr.join('-');
};

const get_app_token = () => {
    const DEVICE_ID = getRandomDEVICE_ID();
    const now = Math.round(Date.now() / 1000);
    const hex_now = '0x' + now.toString(16);
    const md5_now = md5(now.toString());
    const s = 'token://com.coolapk.market/c67ef5943784d09750dcfbb31020f0ab?' + md5_now + '$' + DEVICE_ID + '&com.coolapk.market';
    const md5_s = md5(Buffer.from(s).toString('base64'));
    const token = md5_s + DEVICE_ID + hex_now;
    return token;
};

const base_url = 'https://api.coolapk.com';

const getHeaders = () => ({
    'X-Requested-With': 'XMLHttpRequest',
    'X-App-Id': 'com.coolapk.market',
    'X-App-Token': get_app_token(),
    'X-Sdk-Int': '29',
    'X-Sdk-Locale': 'zh-CN',
    'X-App-Version': '11.0',
    'X-Api-Version': '11',
    'X-App-Code': '2101202',
    'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 10; Redmi K30 5G MIUI/V12.0.3.0.QGICMXM) (#Build; Redmi; Redmi K30 5G; QKQ1.191222.002 test-keys; 10) +CoolMarket/11.0-2101202',
});

const parseTuwenFromRaw = (raw) =>
    raw.map((i) => {
        if (i.type === 'text') {
            const output = i.message
                .split('\n')
                .filter((t) => t !== '')
                .map((t) => `<p>${t}</p>`)
                .join('');
            return output;
        } else if (i.type === 'image') {
            return `<div class="img-container" style="text-align: center;">
                <img src="${i.url}">
                <p class="image-caption" style="text-align: center;">${i.description}</p></div>`;
        } else {
            // console.log(i);
            return `Unkown type`;
        }
    });

const parseDynamic = async (item) => {
    const pubDate = parseDate(item.dateline, 'X');
    if (item.entityType === 'sponsorCard' || item.shareUrl === undefined) {
        return;
    }
    const itemUrl = item.shareUrl.split('?')[0];
    let description, title;
    const type = Number.parseInt(item.type);
    switch (type) {
        case 0:
        case 5:
        case 7: // external share
        case 8:
        case 9:
        case 10:
        case 11:
        case 13: // feedType: video (external)
        case 15:
        case 17:
        case 20: {
            // //////////////////////////////////////////// 基本内容 ////////////////////////////////////////////
            description =
                item.issummary && itemUrl
                    ? await cache.tryGet(itemUrl, async () => {
                          const result = await got(itemUrl, {
                              headers: getHeaders(),
                          });
                          const message = `<p>` + result.data.data?.message.split('\n').join('<br>') + `</p>`;
                          return message;
                      })
                    : `<p>` + item.message + `</p>`;
            const $ = load('<div class="title-filter">' + description + '</div>');
            title = $('.title-filter').text().trim(); // no need to perform substring because it's will be handled by RSSHub 'TITLE_LENGTH_LIMIT'

            // //////////////////////////////////////////// 基本内容结束 ////////////////////////////////////////////

            if (type === 17) {
                const keys = item.extra_key.split(',');
                description += `<p>` + item.vote.message_title + ` 已选${keys.length}项</p>`;
                for (const i of item.vote.options) {
                    if (keys.includes(String(i.id))) {
                        description += `<p>${i.title}√</p>`;
                    }
                }
            } else if (type === 10 || type === 11) {
                title = `${item.message_title} 更多:` + title;
            }

            break;
        }
        case 12:
            title = item.title;
            description = await cache.tryGet(itemUrl, async () => {
                const result = await got(itemUrl, {
                    headers: getHeaders(),
                });

                const raw = JSON.parse(result.data.data.message_raw_output);

                const tags = parseTuwenFromRaw(raw);

                return `<img src="${result.data.data.pic}"><hr>` + tags.join('');
            });
            break;

        default:
            // console.log(item.type);
            // console.log(item);
            break;
    }

    return {
        title,
        description,
        pubDate,
        link: item.shareUrl,
        guid: itemUrl,
        author: item.username,
    };
};

export default { get_app_token, base_url, getHeaders, parseDynamic, dynamicTpye };
