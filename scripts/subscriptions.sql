-- B-Cast 订阅管理表

-- 订阅表：记录RSS订阅信息
CREATE TABLE subscriptions (
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

CREATE INDEX idx_subscriptions_enabled ON subscriptions(enabled);
CREATE INDEX idx_subscriptions_last_check ON subscriptions(last_check_at);
CREATE INDEX idx_subscriptions_url ON subscriptions(bilibili_url);

-- 订阅项目表：记录每个订阅中的视频
CREATE TABLE subscription_items (
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

CREATE INDEX idx_subscription_items_sub ON subscription_items(subscription_id);
CREATE INDEX idx_subscription_items_bvid ON subscription_items(bvid);
CREATE INDEX idx_subscription_items_pubdate ON subscription_items(pub_date DESC);
CREATE UNIQUE INDEX idx_subscription_items_sub_bvid ON subscription_items(subscription_id, bvid);
