import CryptoJS from 'crypto-js';
import { CronJob } from 'cron';
import { Cookie, CookieJar, MemoryCookieStore } from 'tough-cookie';

export interface CloudCookieConfig {
    host: string | undefined;
    uuid: string | undefined;
    password: string | undefined;
    updateCron: string;
}

interface CookieItem {
    domain: string;
    name: string;
    value: string;
    path: string;
    expirationDate: number;
    hostOnly: boolean;
    httpOnly: boolean;
    secure: boolean;
    sameSite: string;
}

interface CookieData {
    [key: string]: CookieItem[];
}

interface DecryptedData {
    cookie_data: CookieData;
    local_storage_data: Record<string, any>;
}

class CloudCookieManager {
    host: string | undefined;
    uuid: string | undefined;
    password: string | undefined;
    job: CronJob<null, CloudCookieManager> | undefined;
    cookieJar = new CookieJar(new MemoryCookieStore(), { rejectPublicSuffixes: false });

    CloudCookieManager() {}

    initial = async (config: CloudCookieConfig): Promise<void> => {
        if (this.host === undefined) {
            this.host = config.host;
            this.uuid = config.uuid;
            this.password = config.password;

            this.job = CronJob.from({
                cronTime: config.updateCron,
                onTick: async (): Promise<void> => {
                    await this.fetchCookies();
                },
                context: this,
                start: true,
                runOnInit: false,
            });
            await this.fetchCookies();
        }
    };

    fetchCookies = async () => {
        try {
            const url = `${this.host}/get/${this.uuid}`;
            const ret = await fetch(url);
            const json = await ret.json();
            if (json && json.encrypted) {
                const { cookie_data } = this.cookieDecrypt(json.encrypted);
                for (const key in cookie_data) {
                    if (!cookie_data.hasOwnProperty(key)) {
                        continue;
                    }
                    // console.log('cookie_data', cookie_data);
                    for (const item of cookie_data[key]) {
                        if (item.sameSite === 'unspecified') {
                            item.sameSite = 'Lax';
                        }
                        const url = item.secure ? `https://${item.domain}` : `http://${item.domain}`;
                        // eslint-disable-next-line no-await-in-loop
                        await this.cookieJar.setCookie(
                            new Cookie({
                                key: item.name,
                                value: item.value,
                                domain: item.domain,
                                path: item.path,
                                expires: new Date(item.expirationDate * 1000),
                                hostOnly: item.hostOnly,
                                httpOnly: item.httpOnly,
                                secure: item.secure,
                                sameSite: item.sameSite,
                            }),
                            url
                        );
                    }
                }
            }
        } catch {
            // console.error('An error occurred:', error.stack);
        }
    };

    cookieDecrypt = (encrypted: string) => {
        const the_key = CryptoJS.MD5(`${this.uuid}-${this.password}`).toString().substring(0, 16);
        const decrypted = CryptoJS.AES.decrypt(encrypted, the_key).toString(CryptoJS.enc.Utf8);
        return JSON.parse(decrypted) as DecryptedData;
    };

    setCookie(domain: string, name: string | undefined, value: string) {
        if (name) {
            this.cookieJar.setCookieSync(`${name}=${value};`, `https://${domain}`);
        } else {
            this.cookieJar.setCookieSync(value, `https://${domain}`);
        }
    }
}

export const manager = new CloudCookieManager();
