import { http, HttpResponse } from 'msw';
import { Cookie, CookieJar } from 'tough-cookie';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { config } from '@/config';
import { scrape, scrapeGet, scrapePost } from '@/utils/trawl';

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('trawl', () => {
    it('uses the native scrape API and syncs response cookies', async () => {
        vi.stubEnv('FLARESOLVERR_URL', 'http://trawl.test');
        config.flaresolverr.url = 'http://trawl.test';

        const calls: unknown[] = [];
        const { default: server } = await import('@/setup.test');
        server.use(
            http.post('http://trawl.test/scrape', async ({ request }) => {
                const body = await request.json();
                calls.push(body);

                return HttpResponse.json({
                    url: 'https://example.com/page',
                    html: '<html><body>ok</body></html>',
                    cookies: [
                        {
                            name: 'cf_clearance',
                            value: 'token',
                            domain: 'example.com',
                            path: '/',
                            expires: 1_893_456_000,
                            httpOnly: true,
                            secure: true,
                            sameSite: 'None',
                        },
                    ],
                    userAgent: 'trawl-ua',
                    statusCode: 200,
                    tier: 3,
                    sessionCached: false,
                    timings: [],
                    totalMs: 100,
                });
            })
        );

        const cookieJar = new CookieJar();
        const cookie = Cookie.fromJSON({
            key: 'rsshub',
            value: 'cookie',
            domain: 'example.com',
            path: '/',
        });
        cookie && cookieJar.setCookie(cookie, 'https://example.com/page');

        const result = await scrape('https://example.com/page', { cookieJar });

        expect(result).toMatchObject({
            content: '<html><body>ok</body></html>',
            userAgent: 'trawl-ua',
            status: 200,
        });
        expect(calls).toEqual([
            {
                url: 'https://example.com/page',
                maxTimeout: config.flaresolverr.maxTimeout,
                headers: {
                    Cookie: 'rsshub=cookie',
                },
            },
        ]);
        expect(cookieJar.getCookiesSync('https://example.com/page').map((cookie) => `${cookie.key}=${cookie.value}`)).toContain('cf_clearance=token');
    });

    it('supports explicit POST bodies through scrape', async () => {
        vi.stubEnv('FLARESOLVERR_URL', 'http://trawl.test');
        config.flaresolverr.url = 'http://trawl.test';

        const { default: server } = await import('@/setup.test');
        server.use(
            http.post('http://trawl.test/scrape', async ({ request }) => {
                const body = (await request.json()) as { url: string };
                return HttpResponse.json({
                    url: body.url,
                    html: JSON.stringify(body),
                    cookies: [],
                    userAgent: 'trawl-ua',
                    statusCode: 200,
                    tier: 1,
                    sessionCached: false,
                    timings: [],
                    totalMs: 10,
                });
            })
        );

        await expect(scrapePost('https://example.com/form', { postData: 'a=1' })).resolves.toMatchObject({
            content: expect.stringContaining('"method":"POST"'),
        });
    });

    it('keeps a simple GET helper for route callers', async () => {
        vi.stubEnv('FLARESOLVERR_URL', 'http://trawl.test');
        config.flaresolverr.url = 'http://trawl.test';

        const { default: server } = await import('@/setup.test');
        server.use(
            http.post('http://trawl.test/scrape', () =>
                HttpResponse.json({
                    url: 'https://example.com/list',
                    html: '<html>list</html>',
                    cookies: [],
                    userAgent: 'trawl-ua',
                    statusCode: 200,
                    tier: 1,
                    sessionCached: false,
                    timings: [],
                    totalMs: 10,
                })
            )
        );

        await expect(scrapeGet('https://example.com/list')).resolves.toMatchObject({
            content: '<html>list</html>',
        });
    });
});
