-- B-Cast MVP - Download Queue Schema
-- 用于Cloudflare D1数据库

CREATE TABLE IF NOT EXISTS download_queue (
  id TEXT PRIMARY KEY,
  bvid TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  duration INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  audio_url TEXT,
  file_size INTEGER,
  retry_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  added_at INTEGER NOT NULL,
  completed_at INTEGER
);

-- 索引：按状态查询（用于获取待下载列表）
CREATE INDEX IF NOT EXISTS idx_queue_status ON download_queue(status);

-- 索引：按bvid查询（用于检查是否已存在）
CREATE INDEX IF NOT EXISTS idx_queue_bvid ON download_queue(bvid);

-- 索引：按添加时间查询（用于排序）
CREATE INDEX IF NOT EXISTS idx_queue_added_at ON download_queue(added_at);
