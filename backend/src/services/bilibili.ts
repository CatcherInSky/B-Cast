// B站内容解析服务
// 合并版本：统一处理合集、UP主空间、单视频
// 参考：https://github.com/DIYgod/RSSHub/tree/master/lib/routes/bilibili

import { addWbiVerifyInfo } from './bilibili-wbi';

interface BilibiliVideo {
  bvid: string;
  aid?: number;
  title: string;
  pic: string;
  author?: string;
  created?: number;
  pubdate?: number;
  length?: string;
  duration?: number;
  description?: string;
}

// API端点
const COLLECTION_API = 'https://api.bilibili.com/x/polymer/web-space/seasons_archives_list';
const UP_VIDEO_API = 'https://api.bilibili.com/x/space/wbi/arc/search'; // 需要WBI签名
const USER_INFO_API = 'https://api.bilibili.com/x/space/acc/info';
const VIDEO_INFO_API = 'https://api.bilibili.com/x/web-interface/view';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const COMMON_HEADERS = {
  'User-Agent': USER_AGENT,
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  // 注意：不要手动设置 Accept-Encoding，让fetch自动处理
  'Referer': 'https://www.bilibili.com/',
  'Origin': 'https://www.bilibili.com',
};

/**
 * 主解析函数：自动识别URL类型并选择对应解析方法
 */
export async function parseBilibili(url: string) {
  const urlObj = new URL(url);
  
  // 判断是否为合集：
  // 1. 路径包含 /channel/collectiondetail
  // 2. 路径包含 /lists/ 且后面有数字（如 /lists/7121357）
  // 3. 路径包含 /lists 且查询参数有 sid
  const pathParts = urlObj.pathname.split('/').filter(p => p);
  const hasSidInPath = pathParts.includes('lists') && 
                       pathParts.length > pathParts.indexOf('lists') + 1 &&
                       /^\d+$/.test(pathParts[pathParts.indexOf('lists') + 1]);
  const hasSidInQuery = urlObj.searchParams.has('sid');
  
  const isCollection = url.includes('collectiondetail') || hasSidInPath || hasSidInQuery;
  
  if (isCollection) {
    console.log('🎯 识别为合集（有sid）');
    return parseCollection(url);
  } 
  // UP主空间（包括 /lists 但没有具体sid的情况）
  else if (url.includes('space.bilibili.com')) {
    console.log('🎯 识别为UP主空间（只有uid）');
    return parseUploader(url);
  } 
  // 单个视频
  else if (url.includes('/video/')) {
    console.log('🎯 识别为单个视频');
    return parseSingleVideo(url);
  }
  
  throw new Error('不支持的URL类型');
}

/**
 * 解析合集（不需要WBI）
 * 支持三种URL格式：
 * 1. https://space.bilibili.com/{uid}/channel/collectiondetail?sid={sid}
 * 2. https://space.bilibili.com/{uid}/lists/{sid}?type=season
 * 3. https://space.bilibili.com/{uid}/lists?sid={sid}
 */
async function parseCollection(url: string) {
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split('/').filter(p => p); // 移除空字符串
  
  let uid: string | null = null;
  let sid: string | null = null;
  
  // 提取uid（通常是第一个数字，在hostname后面）
  if (pathParts.length > 0 && /^\d+$/.test(pathParts[0])) {
    uid = pathParts[0];
  }
  
  // 提取sid
  // 1. 先尝试从查询参数获取
  sid = urlObj.searchParams.get('sid');
  
  // 2. 如果查询参数没有，尝试从路径获取 (格式2: /lists/{sid})
  if (!sid) {
    const listsIndex = pathParts.indexOf('lists');
    if (listsIndex >= 0 && pathParts.length > listsIndex + 1) {
      const potentialSid = pathParts[listsIndex + 1];
      // 确保是数字
      if (/^\d+$/.test(potentialSid)) {
        sid = potentialSid;
      }
    }
  }
  
  console.log('📋 解析合集URL:', { 
    originalUrl: url, 
    uid, 
    sid, 
    pathParts,
    queryParams: Object.fromEntries(urlObj.searchParams.entries())
  });
  
  if (!uid || !sid) {
    throw new Error(`无效的合集URL: uid=${uid}, sid=${sid}`);
  }
  
  const link = `https://space.bilibili.com/${uid}/channel/collectiondetail?sid=${sid}`;
  
  console.log('📡 请求合集API:', `${COLLECTION_API}?mid=${uid}&season_id=${sid}`);
  
  const response = await fetch(
    `${COLLECTION_API}?mid=${uid}&season_id=${sid}&sort_reverse=false&page_num=1&page_size=100`,
    {
      headers: {
        ...COMMON_HEADERS,
        'Referer': link,
      }
    }
  );
  
  const data = await response.json() as any;
  
  console.log('📊 合集API响应:', {
    code: data.code,
    message: data.message,
    hasArchives: !!data.data?.archives,
    archivesCount: data.data?.archives?.length || 0
  });
  
  if (data.code !== 0) {
    throw new Error(`B站API错误 (code: ${data.code}): ${data.message}`);
  }
  
  if (!data.data?.archives) {
    throw new Error('合集不存在或为空');
  }
  
  return {
    playlist: {
      name: data.data.meta.name,
      type: 'collection' as const,
      uploaderName: data.data.meta.name,
      cover: data.data.meta.cover,
      description: data.data.meta.description
    },
    items: data.data.archives.map((item: BilibiliVideo) => ({
      bvid: item.bvid,
      title: item.title,
      duration: item.duration || 0,
      cover: item.pic,
      pubDate: item.pubdate ? item.pubdate * 1000 : Date.now()
    }))
  };
}

/**
 * 解析UP主空间（使用WBI签名）
 */
async function parseUploader(url: string) {
  const uid = url.match(/space\.bilibili\.com\/(\d+)/)?.[1];
  
  if (!uid) {
    throw new Error('无效的UP主URL');
  }
  
  // 构建WBI参数（参考RSSHub）
  console.log(`📝 Building WBI params for UP ${uid}`);
  
  const baseParams: Record<string, string> = {
    mid: String(uid),
    ps: '30',
    tid: '0',
    pn: '1',
    keyword: '',
    order: 'pubdate',
    platform: 'web',
    web_location: '1550101',
    order_avoided: 'true'
  };
  
  console.log('📋 Base params:', JSON.stringify(baseParams, null, 2));
  
  // 添加WBI签名
  console.log('🔐 Adding WBI signature...');
  const signedUrl = await addWbiVerifyInfo(UP_VIDEO_API, baseParams);
  console.log('✅ WBI signature added');
  console.log('📡 Full signed URL:', signedUrl);
  
  // 发送请求
  const videoResponse = await fetch(signedUrl, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Referer': `https://space.bilibili.com/${uid}`,
      'Origin': 'https://space.bilibili.com',
      'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-site',
    }
  });
  
  if (!videoResponse.ok) {
    throw new Error(`HTTP ${videoResponse.status}: ${videoResponse.statusText}`);
  }
  
  let videoData: any;
  try {
    videoData = await videoResponse.json();
  } catch (e: any) {
    const text = await videoResponse.text();
    console.error('❌ Failed to parse JSON response:', {
      error: e.message,
      responsePreview: text.substring(0, 200),
      contentType: videoResponse.headers.get('content-type'),
      contentEncoding: videoResponse.headers.get('content-encoding')
    });
    throw new Error(`B站返回了无效的响应: ${e.message}`);
  }
  
  console.log('📊 API Response:', {
    code: videoData.code,
    message: videoData.message,
    hasData: !!videoData.data,
    hasList: !!videoData.data?.list,
    hasVlist: !!videoData.data?.list?.vlist
  });
  
  if (videoData.code !== 0) {
    throw new Error(`获取视频列表失败 (code: ${videoData.code}): ${videoData.message}`);
  }
  
  const videos = videoData.data?.list?.vlist || [];
  console.log(`✅ Found ${videos.length} videos`);
  
  if (videos.length === 0) {
    throw new Error('该UP主暂无投稿视频');
  }
  
  // 尝试获取UP主信息，失败则使用视频列表中的author
  let name = `UP主${uid}`;
  let face = `https://i0.hdslb.com/bfs/face/member/noface.jpg`;
  
  try {
    const userResponse = await fetch(
      `${USER_INFO_API}?mid=${uid}`,
      {
        headers: {
          'User-Agent': USER_AGENT,
          'Referer': 'https://www.bilibili.com/',
        }
      }
    );
    
    if (userResponse.ok) {
      const userData = await userResponse.json() as any;
      if (userData.code === 0 && userData.data) {
        name = userData.data.name;
        face = userData.data.face;
        console.log('✅ Got user info from API');
      }
    }
  } catch (e: any) {
    console.log('⚠️ Failed to get user info from API, using fallback');
  }
  
  // Fallback: 使用视频列表中的author
  if (name === `UP主${uid}` && videos[0]?.author) {
    name = videos[0].author;
    console.log('✅ Got user name from video list');
  }
  
  return {
    playlist: {
      name: `${name}的投稿`,
      type: 'uploader' as const,
      uploaderName: name,
      cover: face,
      description: `${name}的bilibili空间`
    },
    items: videos.map((item: BilibiliVideo) => ({
      bvid: item.bvid,
      title: item.title,
      duration: parseDuration(item.length || '0:0'),
      cover: item.pic,
      pubDate: item.created ? item.created * 1000 : Date.now()
    }))
  };
}

/**
 * 解析单个视频
 */
async function parseSingleVideo(url: string) {
  const bvid = url.match(/\/video\/(BV\w+)/)?.[1];
  
  if (!bvid) {
    throw new Error('无效的视频URL');
  }
  
  const response = await fetch(
    `${VIDEO_INFO_API}?bvid=${bvid}`,
    {
      headers: {
        ...COMMON_HEADERS,
        'Referer': 'https://www.bilibili.com',
      }
    }
  );
  
  const data = await response.json() as any;
  
  if (data.code !== 0) {
    throw new Error(`获取视频信息失败: ${data.message}`);
  }
  
  const video = data.data;
  
  return {
    playlist: {
      name: video.title,
      type: 'collection' as const,
      uploaderName: video.owner.name,
      cover: video.pic
    },
    items: [{
      bvid: video.bvid,
      title: video.title,
      duration: video.duration,
      cover: video.pic,
      pubDate: video.pubdate * 1000
    }]
  };
}

/**
 * 工具函数：解析时长字符串 "mm:ss" 或 "hh:mm:ss" 为秒数
 */
function parseDuration(length: string): number {
  const parts = length.split(':').map(Number);
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}
