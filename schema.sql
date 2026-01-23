-- B-Cast D1 Database Schema (精简版)
-- 只管理下载队列，其他数据存前端IndexedDB
-- SQLite Database for Cloudflare D1

-- 下载队列表 (核心表)
CREATE TABLE IF NOT EXISTS download_queue (
  id TEXT PRIMARY KEY,
  bvid TEXT NOT NULL UNIQUE,  -- B站视频ID（唯一标识）
  
  -- 基本信息（冗余存储，便于查询）
  title TEXT NOT NULL,
  duration INTEGER,
  
  -- 优先级和状态
  priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('immediate', 'normal')),
  status TEXT NOT NULL DEFAULT 'pending' 
    CHECK(status IN ('pending', 'downloading', 'completed', 'failed')),
  
  -- 下载结果
  audio_url TEXT,          -- R2上的音频URL
  file_size INTEGER,       -- 文件大小（字节）
  audio_format TEXT,       -- 音频格式（m4a/mp3）
  
  -- 重试信息
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_attempt INTEGER,    -- 上次尝试时间
  error_message TEXT,      -- 错误信息
  
  -- 时间戳
  added_at INTEGER NOT NULL,
  completed_at INTEGER,
  
  -- 元数据（可选，用于调试）
  user_agent TEXT          -- 标识是哪个用户添加的（可选，用于多用户场景）
);

-- 索引优化
CREATE INDEX IF NOT EXISTS idx_queue_status ON download_queue(status);
CREATE INDEX IF NOT EXISTS idx_queue_priority_status ON download_queue(priority, status);
CREATE INDEX IF NOT EXISTS idx_queue_added_at ON download_queue(added_at);
CREATE INDEX IF NOT EXISTS idx_queue_bvid ON download_queue(bvid);
CREATE INDEX IF NOT EXISTS idx_queue_completed ON download_queue(completed_at);

-- 下载统计表（可选，用于监控）
CREATE TABLE IF NOT EXISTS download_stats (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 初始化统计数据
INSERT OR IGNORE INTO download_stats (key, value, updated_at) VALUES
  ('total_downloads', 0, 0),
  ('pending_count', 0, 0),
  ('completed_count', 0, 0),
  ('failed_count', 0, 0),
  ('total_audio_size', 0, 0);

-- 下载历史表（可选，保留最近的下载记录用于分析）
CREATE TABLE IF NOT EXISTS download_history (
  id TEXT PRIMARY KEY,
  bvid TEXT NOT NULL,
  status TEXT NOT NULL,  -- 'success' | 'failed'
  error_message TEXT,
  download_duration INTEGER,  -- 下载耗时（秒）
  file_size INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_history_created_at ON download_history(created_at);
CREATE INDEX IF NOT EXISTS idx_history_bvid ON download_history(bvid);
