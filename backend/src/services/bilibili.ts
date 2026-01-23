import type { BilibiliVideo, ParseResult } from '../types';

// B站API端点
const UP_VIDEO_API = 'https://api.bilibili.com/x/space/wbi/arc/search';
const COLLECTION_API = 'https://api.bilibili.com/x/polymer/web-space/seasons_archives_list';
const USER_INFO_API = 'https://api.bilibili.com/x/space/acc/info';
const VIDEO_INFO_API = 'https://api.bilibili.com/x/web-interface/view';

// 通用请求头
const COMMON_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://www.bilibili.com',
};

/**
 * 解析B站URL
 */
export async function parseBilibili(url: string): Promise<ParseResult> {
  // 解析合集
  if (url.includes('collectiondetail')) {
    return parseCollection(url);
  }
  
  // 解析UP主空间
  if (url.includes('space.bilibili.com')) {
    return parseUploader(url);
  }
  
  // 解析单个视频
  if (url.includes('/video/')) {
    return parseSingleVideo(url);
  }
  
  throw new Error('不支持的URL类型');
}

/**
 * 解析合集
 */
async function parseCollection(url: string): Promise<ParseResult> {
  const urlObj = new URL(url);
  const uid = urlObj.pathname.split('/')[1];
  const sid = urlObj.searchParams.get('sid');
  
  if (!uid || !sid) {
    throw new Error('无效的合集URL');
  }
  
  const link = `https://space.bilibili.com/${uid}/channel/collectiondetail?sid=${sid}`;
  
  // 获取合集数据
  const response = await fetch(
    `${COLLECTION_API}?mid=${uid}&season_id=${sid}&sort_reverse=false&page_num=1&page_size=100`,
    {
      headers: {
        ...COMMON_HEADERS,
        'Referer': link,
      }
    }
  );
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  const data = await response.json() as {
    code: number;
    message?: string;
    data?: {
      meta: {
        name: string;
        cover: string;
        description: string;
      };
      archives: BilibiliVideo[];
    };
  };
  
  if (data.code !== 0) {
    throw new Error(`B站API错误: ${data.message || '未知错误'}`);
  }
  
  if (!data.data?.archives) {
    throw new Error('合集不存在或为空');
  }
  
  return {
    playlist: {
      name: data.data.meta.name,
      type: 'collection',
      uploaderName: data.data.meta.name,
      cover: data.data.meta.cover,
      description: data.data.meta.description,
    },
    items: data.data.archives.map((item: BilibiliVideo) => ({
      bvid: item.bvid,
      title: item.title,
      duration: item.duration || 0,
      cover: item.pic,
      pubDate: item.pubdate ? item.pubdate * 1000 : Date.now(),
    })),
  };
}

/**
 * 解析UP主空间
 */
async function parseUploader(url: string): Promise<ParseResult> {
  const uid = url.match(/space\.bilibili\.com\/(\d+)/)?.[1];
  
  if (!uid) {
    throw new Error('无效的UP主URL');
  }
  
  // 1. 获取UP主信息
  const userResponse = await fetch(
    `${USER_INFO_API}?mid=${uid}`,
    { headers: COMMON_HEADERS }
  );
  
  if (!userResponse.ok) {
    throw new Error(`获取UP主信息失败: HTTP ${userResponse.status}`);
  }
  
  const userData = await userResponse.json() as {
    code: number;
    message?: string;
    data?: {
      name: string;
      face: string;
      sign: string;
    };
  };
  
  if (userData.code !== 0) {
    throw new Error(`获取UP主信息失败: ${userData.message || '未知错误'}`);
  }
  
  if (!userData.data) {
    throw new Error('UP主不存在');
  }
  
  const name = userData.data.name;
  const face = userData.data.face;
  const sign = userData.data.sign;
  
  // 2. 获取视频列表
  const videoResponse = await fetch(
    `${UP_VIDEO_API}?mid=${uid}&ps=30&tid=0&pn=1&keyword=&order=pubdate&platform=web&web_location=1550101`,
    {
      headers: {
        ...COMMON_HEADERS,
        'Referer': `https://space.bilibili.com/${uid}`,
        'Origin': 'https://space.bilibili.com',
      }
    }
  );
  
  if (!videoResponse.ok) {
    throw new Error(`获取视频列表失败: HTTP ${videoResponse.status}`);
  }
  
  const videoData = await videoResponse.json() as {
    code: number;
    message?: string;
    data?: {
      list?: {
        vlist?: BilibiliVideo[];
      };
    };
  };
  
  if (videoData.code !== 0) {
    throw new Error(`获取视频列表失败: ${videoData.message || '未知错误'}`);
  }
  
  const videos = videoData.data?.list?.vlist || [];
  
  if (videos.length === 0) {
    throw new Error('该UP主暂无投稿视频');
  }
  
  return {
    playlist: {
      name: `${name}的投稿`,
      type: 'uploader',
      uploaderName: name,
      cover: face,
      description: sign || `${name}的bilibili空间`,
    },
    items: videos.map((item: BilibiliVideo) => ({
      bvid: item.bvid,
      title: item.title,
      duration: parseDuration(item.length || '0:0'),
      cover: item.pic,
      pubDate: item.created ? item.created * 1000 : Date.now(),
    })),
  };
}

/**
 * 解析单个视频
 */
async function parseSingleVideo(url: string): Promise<ParseResult> {
  const bvid = url.match(/\/video\/(BV\w+)/)?.[1];
  
  if (!bvid) {
    throw new Error('无效的视频URL');
  }
  
  // 获取视频信息
  const response = await fetch(
    `${VIDEO_INFO_API}?bvid=${bvid}`,
    { headers: COMMON_HEADERS }
  );
  
  if (!response.ok) {
    throw new Error(`获取视频信息失败: HTTP ${response.status}`);
  }
  
  const data = await response.json() as {
    code: number;
    message?: string;
    data?: {
      bvid: string;
      title: string;
      pic: string;
      duration: number;
      pubdate: number;
      desc: string;
      owner: {
        name: string;
      };
    };
  };
  
  if (data.code !== 0) {
    throw new Error(`获取视频信息失败: ${data.message || '未知错误'}`);
  }
  
  if (!data.data) {
    throw new Error('视频不存在');
  }
  
  const video = data.data;
  
  return {
    playlist: {
      name: video.title,
      type: 'single',
      uploaderName: video.owner.name,
      cover: video.pic,
      description: video.desc,
    },
    items: [{
      bvid: video.bvid,
      title: video.title,
      duration: video.duration,
      cover: video.pic,
      pubDate: video.pubdate * 1000,
    }],
  };
}

/**
 * 解析时长字符串 "mm:ss" 或 "hh:mm:ss" 为秒数
 */
function parseDuration(length: string): number {
  const parts = length.split(':').map(Number);
  
  if (parts.length === 2) {
    // mm:ss
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    // hh:mm:ss
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  
  return 0;
}
