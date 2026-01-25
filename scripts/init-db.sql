-- B-Cast 完整数据库初始化脚本
-- 包含所有表结构

-- 1. 订阅表：记录RSS订阅信息
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,  -- 'collection' | 'uploader' | 'video'
  bilibili_url TEXT NOT NULL UNIQUE,
  rss_url TEXT NOT NULL,  -- R2上的RSS文件URL
  uploader_name TEXT,
  cover TEXT,
  description TEXT,
  last_check_at INTEGER,
  last_video_bvid TEXT,  -- 最新视频的BVID，用于快速判断是否有更新
  last_video_pubdate INTEGER,
  enabled INTEGER NOT NULL DEFAULT 1,  -- 是否启用自动更新
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_enabled ON subscriptions(enabled);
CREATE INDEX IF NOT EXISTS idx_subscriptions_last_check ON subscriptions(last_check_at);
CREATE INDEX IF NOT EXISTS idx_subscriptions_url ON subscriptions(bilibili_url);

-- 2. 订阅项目表：记录每个订阅中的视频
CREATE TABLE IF NOT EXISTS subscription_items (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL,
  bvid TEXT NOT NULL,
  title TEXT NOT NULL,
  duration INTEGER,
  cover TEXT,
  pub_date INTEGER NOT NULL,
  download_queue_id TEXT,  -- 关联到download_queue表的id
  added_at INTEGER NOT NULL,
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_subscription_items_sub ON subscription_items(subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscription_items_bvid ON subscription_items(bvid);
CREATE INDEX IF NOT EXISTS idx_subscription_items_pubdate ON subscription_items(pub_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_items_sub_bvid ON subscription_items(subscription_id, bvid);

-- 3. 下载队列表
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
  completed_at INTEGER,
  updated_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_queue_status ON download_queue(status);
CREATE INDEX IF NOT EXISTS idx_queue_bvid ON download_queue(bvid);
CREATE INDEX IF NOT EXISTS idx_queue_added_at ON download_queue(added_at);
