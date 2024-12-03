import { DataItem, Route } from '@/types';
import got from '@/utils/got';
import utils from './utils';
const getLinkAndTitle = (type, period): { link: string; title: string } => {
    const baseURL = 'https://api.coolapk.com/v6/page/dataList?url=';
    let link;
    const types = {
        jrrm: {
            title: '今日热门',
            url: baseURL + '%2Ffeed%2FstatList%3FcacheExpires%3D300%26statType%3Dday%26sortField%3Ddetailnum%26title%3D%E4%BB%8A%E6%97%A5%E7%83%AD%E9%97%A8&title=%E4%BB%8A%E6%97%A5%E7%83%AD%E9%97%A8&subTitle=&page=1',
        },

        mrrw: {
            title: '每日热闻',
            url:
                baseURL +
                '%23/feed/multiTagFeedList?tag%3D%E4%BB%8A%E6%97%A5%E7%83%AD%E7%82%B9%2C%E6%AF%8F%E6%97%A5%E6%B8%B8%E6%88%8F%E8%B5%84%E8%AE%AF%26feedType%3D0%26is_html_article%3D0%2C2%26listType%3Ddateline_desc%26excludeUid%3D470134%2C3888781%2C723545%2C20111993%2C1541618%2C1357341%2C545834%2C23178237%2C1708700%2C6717911%2C14337756%2C3176833%2C29820416%2C17990332&title=%E5%85%A8%E9%83%A8&page=1',
        },

        dzb: {
            title: '点赞榜',
            sortField: 'likenum',
        },

        scb: {
            title: '收藏榜',
            sortField: 'favnum',
        },
        plb: {
            title: '评论榜',
            sortField: 'replynum',
        },
        ktb: {
            title: '酷图榜',
            sortField: 'likenum',
        },
    };

    const periods = {
        daily: {
            description: '日榜',
            statType: 'day',
        },
        weekly: {
            description: '周榜',
            statType: '7days',
        },
    };

    switch (type) {
        case 'jrrm':
            return {
                link: types.jrrm.url,
                title: types.jrrm.title,
            };

        case 'mrrw':
            return {
                link: types.mrrw.url,
                title: types.mrrw.title,
            };

        case 'ktb': {
            const trans = {
                daily: {
                    description: '周榜',
                    statDays: '7days',
                },
                weekly: {
                    description: '月榜',
                    statDays: '30days',
                },
            };
            link = `#/feed/coolPictureList?statDays=` + trans[period].statDays + `&listType=statFavNum&buildCard=1&title=` + trans[period].description + `&page=1`;
            return {
                link: baseURL + encodeURIComponent(link),
                title: '酷图榜-' + trans[period].description,
            };
        }
        default:
            link = `#/feed/statList?statType=` + periods[period].statType + `&sortField=` + types[type].sortField + `&title=` + periods[period].description + `&page=1`;
            return {
                link: baseURL + encodeURIComponent(link),
                title: types[type].title + `-` + periods[period].description,
            };
    }
};

export const route: Route = {
    path: '/hot/:type?/:period?',
    categories: ['social-media'],
    example: '/coolapk/hot',
    parameters: { type: '默认为`jrrm`', period: '默认为`daily`' },
    features: {
        requireConfig: [
            {
                name: 'ALLOW_USER_HOTLINK_TEMPLATE',
                optional: true,
                description: '设置为`true`并添加`image_hotlink_template`参数来代理图片',
            },
        ],
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    name: '热榜',
    maintainers: ['xizeyoupan'],
    handler,
    description: `| 参数名称 | 今日热门 | 每日热闻 | 点赞榜 | 评论榜 | 收藏榜 | 酷图榜 |
  | -------- | -------- | ------ | ------ | ------ | ------ | ------ |
  | type     | jrrm     | mrrw    | dzb    | plb    | scb    | ktb    |

  | 参数名称 | 日榜  | 周榜   |
  | -------- | ----- | ------ |
  | period   | daily | weekly |

  :::tip
  今日热门没有周榜，酷图榜日榜的参数会变成周榜，周榜的参数会变成月榜。
  :::`,
};

async function handler(ctx) {
    const type = ctx.req.param('type') || 'jrrm';
    const period = ctx.req.param('period') || 'daily';
    const { link, title } = getLinkAndTitle(type, period);
    const headers = utils.getHeaders();
    const r = await got(link, {
        headers,
    });
    const data = r.data.data;
    // console.log('data', r, headers);
    const t: any[] = [];
    for (const i of data) {
        if (i.entityType === 'card') {
            for (const k of i.entities) {
                t.push(k as any);
            }
        } else {
            t.push(i as any);
        }
    }

    const out: (DataItem | undefined)[] = await Promise.all(t.map((item) => utils.parseDynamic(item)));

    return {
        title,
        link: 'https://www.coolapk.com/',
        description: `feedId:85083087057291264+userId:77884867866416128`,
        item: out.filter(Boolean) as DataItem[],
    };
}
