import type { CookieJar } from 'tough-cookie';
import { Cookie } from 'tough-cookie';

import { config } from '@/config';
import ofetch from '@/utils/ofetch';

interface TrawlCookie {
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite?: string;
}

interface TrawlResult {
    url: string;
    html: string;
    cookies: TrawlCookie[];
    userAgent: string;
    statusCode: number;
}

interface TrawlErrorResponse {
    error?: string;
    message?: string;
}

export interface ScrapeOptions {
    cookieJar?: CookieJar;
    maxTimeout?: number;
}

export interface ScrapePostOptions extends ScrapeOptions {
    postData?: string;
}

export interface ScrapeResult {
    content: string;
    cookies: TrawlCookie[];
    userAgent: string;
    status: number;
}

const prepareHeaders = (url: string, cookieJar?: CookieJar): Record<string, string> | undefined => {
    if (!cookieJar) {
        return undefined;
    }

    const cookie = cookieJar.getCookieStringSync(url);
    return cookie ? { Cookie: cookie } : undefined;
};

const syncResponseCookies = (res: TrawlResult, cookieJar?: CookieJar) => {
    if (!cookieJar || !res.cookies) {
        return;
    }

    for (const c of res.cookies) {
        const sameSite = c.sameSite === 'None' || c.sameSite === 'Lax' || c.sameSite === 'Strict' ? c.sameSite : 'Lax';
        cookieJar.setCookieSync(
            new Cookie({
                key: c.name,
                value: c.value,
                domain: c.domain,
                path: c.path,
                expires: c.expires ? new Date(c.expires * 1000) : undefined,
                httpOnly: c.httpOnly,
                secure: c.secure,
                sameSite,
            }),
            res.url
        );
    }
};

const buildResult = (res: TrawlResult): ScrapeResult => ({
    content: res.html,
    cookies: res.cookies,
    userAgent: res.userAgent,
    status: res.statusCode,
});

export const scrape = async (url: string, options?: ScrapePostOptions): Promise<ScrapeResult> => {
    const endpoint = config.flaresolverr.url;
    if (!endpoint) {
        throw new Error('Trawl URL is not configured. Set FLARESOLVERR_URL environment variable.');
    }

    const maxTimeout = options?.maxTimeout ?? config.flaresolverr.maxTimeout;
    const headers = prepareHeaders(url, options?.cookieJar);
    const res = await ofetch<TrawlResult | TrawlErrorResponse>(`${endpoint}/scrape`, {
        method: 'POST',
        body: {
            url,
            maxTimeout,
            ...(headers ? { headers } : {}),
            ...(options?.postData ? { method: 'POST', body: options.postData } : {}),
        },
    });

    if ('html' in res) {
        syncResponseCookies(res, options?.cookieJar);
        return buildResult(res);
    }

    throw new Error(`Trawl scrape failed: ${res.error ?? res.message ?? 'unknown error'}`);
};

export const scrapeGet = (url: string, options?: ScrapeOptions): Promise<ScrapeResult> => scrape(url, options);

export const scrapePost = (url: string, options?: ScrapePostOptions): Promise<ScrapeResult> => scrape(url, options);
