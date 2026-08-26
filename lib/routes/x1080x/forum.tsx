import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { DataItem, Route } from '@/types';

export const route: Route = {
    path: '/forum/:fid?',
    categories: ['bbs'],
    example: '/x1080x/forum/263',
    parameters: { fid: 'forum id, can be found in URL' },
    features: {
        requirePuppeteer: false,
        antiCrawler: true,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
        nsfw: true,
    },
    name: 'forum',
    maintainers: ['ksmaze'],
    handler,
};

async function handler(ctx) {
    const fid = ctx.req.param('fid');
    return await loadLocalFeed(fid);
}

async function loadLocalFeed(fid: string) {
    const jsonPath = path.join(__dirname, 'x1080x.json');
    const raw = await readFile(jsonPath, 'utf-8');
    const data = JSON.parse(raw) as Record<string, { title: string; link: string; description: string; item: DataItem[] }>;
    const feed = data[fid];
    if (!feed) {
        throw new Error(`No fallback feed found for fid ${fid} in x1080x.json`);
    }
    return feed;
}
