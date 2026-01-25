-- B-Cast MVP 下载队列表
CREATE TABLE download_queue (
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

CREATE INDEX idx_queue_status ON download_queue(status);
CREATE INDEX idx_queue_bvid ON download_queue(bvid);
CREATE INDEX idx_queue_added_at ON download_queue(added_at);
