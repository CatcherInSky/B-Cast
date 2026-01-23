// Cloudflare Worker环境变量类型
export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
}

// B站视频信息
export interface BilibiliVideo {
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

// 播放列表类型
export type PlaylistType = 'collection' | 'uploader' | 'single';

// 解析结果
export interface ParseResult {
  playlist: {
    name: string;
    type: PlaylistType;
    uploaderName: string;
    cover?: string;
    description?: string;
  };
  items: Array<{
    bvid: string;
    title: string;
    duration: number;
    cover: string;
    pubDate: number;
  }>;
}

// 下载队列项
export interface DownloadQueueItem {
  id: string;
  bvid: string;
  title: string;
  duration?: number;
  status: 'pending' | 'downloading' | 'downloaded' | 'failed';
  audio_url?: string;
  file_size?: number;
  retry_count: number;
  error_message?: string;
  added_at: number;
  completed_at?: number;
}
