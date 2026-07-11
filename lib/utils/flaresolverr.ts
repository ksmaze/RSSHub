import { config } from '@/config';
import { Cookie, CookieJar } from 'tough-cookie';
import logger from '@/utils/logger';
import ofetch from '@/utils/ofetch';

interface FlareSolverrCookie {
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    size: number;
    httpOnly: boolean;
    secure: boolean;
    session: boolean;
    sameSite: string;
}

interface FlareSolverrSolution {
    url: string;
    status: number;
    headers: Record<string, string>;
    response: string;
    cookies: FlareSolverrCookie[];
    userAgent: string;
}

interface FlareSolverrResponse {
    solution: FlareSolverrSolution;
    status: string;
    message: string;
    startTimestamp: number;
    endTimestamp: number;
    version: string;
}

interface FlareSolverrRequestOptions {
    cookieJar?: CookieJar;
    maxTimeout?: number;
}

interface FlareSolverrPostOptions extends FlareSolverrRequestOptions {
    postData?: string;
}

interface FlareSolverrRequestResult {
    content: string;
    cookies: FlareSolverrCookie[];
    userAgent: string;
    status: number;
}

const postCommand = async (cmd: string, params: Record<string, unknown> = {}) => {
    const url = config.flaresolverr.url;
    if (!url) {
        throw new Error('FlareSolverr URL is not configured. Set FLARESOLVERR_URL environment variable.');
    }
    const response = await ofetch(`${url}/v1`, {
        method: 'POST',
        body: { cmd, ...params },
    });
    return response;
};

export const getFlareSolverrSession = async () => {
    const createRes = await postCommand('sessions.create');
    if (createRes.status !== 'ok') {
        throw new Error(`FlareSolverr sessions.create failed: ${createRes.message}`);
    }
    const session: string = createRes.session;
    logger.debug(`FlareSolverr session created: ${session}`);

    const prepareCookies = (url: string, cookieJar?: CookieJar): { name: string; value: string }[] | undefined => {
        if (!cookieJar) {
            return undefined;
        }
        const jarCookies = cookieJar.getCookiesSync(url);
        return jarCookies.length > 0 ? jarCookies.map((c) => ({ name: c.key, value: c.value })) : undefined;
    };

    const syncResponseCookies = (res: FlareSolverrResponse, cookieJar?: CookieJar) => {
        if (cookieJar && res.solution.cookies) {
            for (const c of res.solution.cookies) {
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
                    res.solution.url
                );
            }
        }
    };

    const buildResult = (res: FlareSolverrResponse): FlareSolverrRequestResult => ({
        content: res.solution.response,
        cookies: res.solution.cookies,
        userAgent: res.solution.userAgent,
        status: res.solution.status,
    });

    const get = async (url: string, options?: FlareSolverrRequestOptions): Promise<FlareSolverrRequestResult> => {
        const maxTimeout = options?.maxTimeout ?? config.flaresolverr.maxTimeout;
        const cookies = prepareCookies(url, options?.cookieJar);

        const res: FlareSolverrResponse = await postCommand('request.get', {
            url,
            session,
            maxTimeout,
            ...(cookies ? { cookies } : {}),
            disableMedia: true,
        });

        if (res.status !== 'ok') {
            throw new Error(`FlareSolverr request.get failed: ${res.message}`);
        }

        syncResponseCookies(res, options?.cookieJar);
        return buildResult(res);
    };

    const post = async (url: string, options?: FlareSolverrPostOptions): Promise<FlareSolverrRequestResult> => {
        const maxTimeout = options?.maxTimeout ?? config.flaresolverr.maxTimeout;
        const cookies = prepareCookies(url, options?.cookieJar);

        const res: FlareSolverrResponse = await postCommand('request.post', {
            url,
            session,
            maxTimeout,
            ...(cookies ? { cookies } : {}),
            ...(options?.postData ? { postData: options.postData } : {}),
            disableMedia: true,
        });

        if (res.status !== 'ok') {
            throw new Error(`FlareSolverr request.post failed: ${res.message}`);
        }

        syncResponseCookies(res, options?.cookieJar);
        return buildResult(res);
    };

    const destroy = async () => {
        try {
            await postCommand('sessions.destroy', { session });
            logger.debug(`FlareSolverr session destroyed: ${session}`);
        } catch (error) {
            logger.warn(`FlareSolverr sessions.destroy failed for ${session}: ${error}`);
        }
    };

    return {
        get,
        post,
        destroy,
    };
};
