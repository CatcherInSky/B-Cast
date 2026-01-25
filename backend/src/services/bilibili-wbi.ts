// B站WBI签名验证实现
// 参考：https://github.com/DIYgod/RSSHub/blob/master/lib/routes/bilibili/utils.ts
// 使用Web Crypto API（Cloudflare Workers原生支持）

// WBI混淆表
const mixinKeyEncTab = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
    33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
    61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
    36, 20, 34, 44, 52
];

interface WbiKeys {
    img_key: string;
    sub_key: string;
}

let cachedWbiKeys: WbiKeys | null = null;
let cacheTime = 0;
const CACHE_DURATION = 1000 * 60 * 60 * 12; // 12小时缓存（B站WBI密钥每日更替）

/**
 * 获取混淆后的密钥
 */
function getMixinKey(orig: string): string {
    return mixinKeyEncTab.map(n => orig[n]).join('').slice(0, 32);
}

/**
 * 使用Web Crypto API计算MD5（Workers环境）
 */
async function md5(text: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('MD5', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 对参数进行WBI签名
 */
export async function encWbi(params: Record<string, string | number>, imgKey: string, subKey: string): Promise<string> {
    const mixinKey = getMixinKey(imgKey + subKey);
    const currTime = Math.round(Date.now() / 1000);
    
    console.log('🔐 WBI Signing:', {
        mixinKey: mixinKey.substring(0, 16) + '...',
        wts: currTime,
        paramsCount: Object.keys(params).length
    });
    
    // 添加wts时间戳
    const newParams: Record<string, string | number> = { ...params, wts: currTime };
    
    // 按key排序
    const sortedParams = Object.keys(newParams)
        .sort()
        .map(key => `${key}=${encodeURIComponent(newParams[key])}`)
        .join('&');
    
    console.log('📝 Sorted params (first 200 chars):', sortedParams.substring(0, 200));
    console.log('🔑 Signing string:', (sortedParams + mixinKey).substring(0, 100) + '...');
    
    // 计算MD5签名（使用Web Crypto API）
    const wbiSign = await md5(sortedParams + mixinKey);
    
    console.log('✅ Generated w_rid:', wbiSign);
    
    return `${sortedParams}&w_rid=${wbiSign}`;
}

/**
 * 获取WBI密钥
 * 参考：https://github.com/yllhwa/RSSWorker 和知乎文章的实现
 */
export async function getWbiKeys(): Promise<WbiKeys> {
    // 检查缓存
    if (cachedWbiKeys && Date.now() - cacheTime < CACHE_DURATION) {
        const remainingTime = Math.round((CACHE_DURATION - (Date.now() - cacheTime)) / 1000 / 60);
        console.log(`✅ Using cached WBI keys (expires in ${remainingTime}m)`);
        return cachedWbiKeys;
    }
    
    try {
        console.log('🔄 Fetching fresh WBI keys from Bilibili API...');
        
        // 使用更宽松的headers，不需要所有的浏览器特征
        const response = await fetch('https://api.bilibili.com/x/web-interface/nav', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://www.bilibili.com/',
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json() as any;
        
        // 未登录状态下，B站仍会返回WBI keys
        // code可能是0（已登录）或-101（未登录），但都有wbi_img
        if (data.data && data.data.wbi_img) {
            const imgUrl = data.data.wbi_img.img_url;
            const subUrl = data.data.wbi_img.sub_url;
            
            // 从URL中提取key
            const imgKey = imgUrl.split('/').pop()?.split('.')[0] || '';
            const subKey = subUrl.split('/').pop()?.split('.')[0] || '';
            
            if (!imgKey || !subKey) {
                throw new Error('Failed to extract WBI keys from URLs');
            }
            
            cachedWbiKeys = { img_key: imgKey, sub_key: subKey };
            cacheTime = Date.now();
            
            console.log('✅ WBI keys fetched:', { 
                imgKey: imgKey.substring(0, 10) + '...', 
                subKey: subKey.substring(0, 10) + '...',
                loginStatus: data.code === 0 ? 'logged in' : 'guest'
            });
            
            return cachedWbiKeys;
        }
        
        // 如果没有wbi_img，说明API结构变了
        throw new Error(`Unexpected API response: ${JSON.stringify(data).substring(0, 200)}`);
        
    } catch (error: any) {
        console.error('❌ Failed to get WBI keys:', error.message);
        throw new Error(`Cannot fetch WBI keys: ${error.message}`);
    }
}

/**
 * 为URL添加WBI签名
 */
export async function addWbiVerifyInfo(url: string, params: Record<string, string | number>): Promise<string> {
    const keys = await getWbiKeys();
    const signedParams = await encWbi(params, keys.img_key, keys.sub_key);
    
    return url.includes('?')
        ? `${url}&${signedParams}`
        : `${url}?${signedParams}`;
}
