# B-Cast MVP 版本设计文档

> 最小可行产品版本，用于验证B站URL解析和下载能力

---

## 1. MVP 范围

### 1.1 包含的功能

**前端：**
- ✅ 添加播放列表（输入B站URL）
- ✅ 查看播放列表（展示解析结果）
- ✅ 查看播放项详情
- ✅ 删除播放列表
- ✅ 查看下载状态

**后端：**
- ✅ B站URL解析API
- ✅ 下载队列管理
- ✅ 下载状态查询
- ✅ R2音频存储

**下载Worker：**
- ✅ 手动触发下载（workflow_dispatch）
- ✅ 从D1读取队列
- ✅ yt-dlp下载B站音频
- ✅ 上传到R2

---

## 2. 简化架构

```
┌─────────────────────────────────┐
│      前端 (React + Vite)        │
│                                  │
│  IndexedDB (仅存播放列表)       │
│  └─ playlists                   │
│  └─ playlist_items              │
└──────────┬──────────────────────┘
           │ API
           ↓
    ┌─────────────┐         ┌─────────┐
    │ Cloudflare  │ ─────→  │Cloudflare│
    │   Workers   │         │   R2    │
    │   (Hono)    │         │ (音频)   │
    └──────┬──────┘         └─────────┘
           │                      ↑
           ↓                      │
      ┌────────┐                  │
      │   D1   │                  │
      │(下载队列)│                 │
      └────────┘                  │
           ↑                      │
           │                      │
    ┌──────┴──────────────────────┘
    │  GitHub Actions
    │  (手动触发下载)
    └─────────────────
```

---

## 3. MVP 数据模型

### 3.1 前端 IndexedDB（简化）

```typescript
// db.ts
import Dexie, { Table } from 'dexie';

export interface Playlist {
  id: string;                    // uuid
  name: string;
  type: 'collection' | 'uploader';
  bilibiliUrl: string;
  uploaderName: string;
  cover?: string;
  description?: string;
  createdAt: number;
}

export interface PlaylistItem {
  id: string;                    // uuid
  playlistId: string;
  bvid: string;
  title: string;
  duration: number;
  cover: string;
  pubDate: number;
  downloadStatus: 'pending' | 'downloading' | 'downloaded' | 'failed';
  audioUrl?: string;
  fileSize?: number;
  addedAt: number;
}

export class BCastDB extends Dexie {
  playlists!: Table<Playlist>;
  playlistItems!: Table<PlaylistItem>;
  
  constructor() {
    super('b-cast-mvp');
    this.version(1).stores({
      playlists: 'id, name, createdAt',
      playlistItems: 'id, playlistId, bvid, downloadStatus, addedAt'
    });
  }
}

export const db = new BCastDB();
```

### 3.2 后端 D1（简化）

```sql
-- download_queue.sql
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
```

### 3.3 R2 存储结构

```
b-cast-audio/
    ├── BV1xx4y1x7xx.m4a
    ├── BV1yy4y1y7yy.m4a
    └── ...
```

---

## 4. MVP API 设计

### 4.1 核心接口（无认证）

#### POST /api/bilibili/parse
解析B站URL

```typescript
// Request
{
  url: string;  // B站URL
}

// Response
{
  success: boolean;
  data: {
    playlist: {
      name: string;
      type: 'collection' | 'uploader';
      uploaderName: string;
      cover?: string;
      description?: string;
    },
    items: Array<{
      bvid: string;
      title: string;
      duration: number;
      cover: string;
      pubDate: number;
    }>
  },
  error?: string;
}
```

#### POST /api/downloads/queue
添加到下载队列

```typescript
// Request
{
  items: Array<{
    bvid: string;
    title: string;
    duration: number;
  }>
}

// Response
{
  success: boolean;
  queuedCount: number;
}
```

#### GET /api/downloads/status?bvids=BV1xx,BV1yy
查询下载状态

```typescript
// Response
{
  items: Array<{
    bvid: string;
    status: 'pending' | 'downloading' | 'downloaded' | 'failed';
    audioUrl?: string;
    fileSize?: number;
    error?: string;
  }>
}
```

#### GET /api/downloads/list
获取所有下载记录（用于调试）

```typescript
// Response
{
  items: Array<{
    id: string;
    bvid: string;
    title: string;
    status: string;
    audioUrl?: string;
    fileSize?: number;
    error?: string;
    addedAt: number;
    completedAt?: number;
  }>
}
```

---

## 5. 前端实现

### 5.1 页面结构

```
/                       首页 - 播放列表管理
  ├── AddPlaylist       添加播放列表组件
  ├── PlaylistCard      播放列表卡片
  └── ItemList          播放项列表

/downloads              下载状态页（用于调试）
  └── DownloadList      下载队列列表
```

### 5.2 核心组件

#### 添加播放列表

```typescript
// components/AddPlaylist.tsx
import { useState } from 'react';
import { apiCall } from '../utils/api';
import { db } from '../db';
import { v4 as uuid } from 'uuid';

export function AddPlaylist() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAdd = async () => {
    setLoading(true);
    setError('');

    try {
      // 1. 解析URL
      const parseRes = await apiCall('/api/bilibili/parse', {
        method: 'POST',
        body: JSON.stringify({ url })
      });

      if (!parseRes.success) {
        throw new Error(parseRes.error || '解析失败');
      }

      const { playlist, items } = parseRes.data;

      // 2. 保存到IndexedDB
      const playlistId = uuid();
      await db.playlists.add({
        id: playlistId,
        name: playlist.name,
        type: playlist.type,
        bilibiliUrl: url,
        uploaderName: playlist.uploaderName,
        cover: playlist.cover,
        description: playlist.description,
        createdAt: Date.now()
      });

      const playlistItems = items.map(item => ({
        id: uuid(),
        playlistId,
        bvid: item.bvid,
        title: item.title,
        duration: item.duration,
        cover: item.cover,
        pubDate: item.pubDate,
        downloadStatus: 'pending' as const,
        addedAt: Date.now()
      }));

      await db.playlistItems.bulkAdd(playlistItems);

      // 3. 添加到下载队列
      await apiCall('/api/downloads/queue', {
        method: 'POST',
        body: JSON.stringify({
          items: items.map(item => ({
            bvid: item.bvid,
            title: item.title,
            duration: item.duration
          }))
        })
      });

      setUrl('');
      alert('添加成功！请在GitHub Actions中手动触发下载。');

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <h2>添加播放列表</h2>
      
      <input
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="输入B站URL（合集/UP主空间/单个视频）"
        className="input"
      />

      {error && <div className="error">{error}</div>}

      <button onClick={handleAdd} disabled={loading || !url}>
        {loading ? '解析中...' : '添加'}
      </button>

      <div className="help-text">
        <p>支持的URL类型：</p>
        <ul>
          <li>UP主空间: https://space.bilibili.com/123456</li>
          <li>合集: https://space.bilibili.com/123456/channel/collectiondetail?sid=789</li>
          <li>单个视频: https://www.bilibili.com/video/BV1xx4y1x7xx</li>
        </ul>
      </div>
    </div>
  );
}
```

#### 播放列表卡片

```typescript
// components/PlaylistCard.tsx
import { useState, useEffect } from 'react';
import { db, Playlist, PlaylistItem } from '../db';
import { AudioPlayer } from './AudioPlayer';

interface Props {
  playlist: Playlist;
  onDelete: () => void;
}

export function PlaylistCard({ playlist, onDelete }: Props) {
  const [items, setItems] = useState<PlaylistItem[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [selectedItem, setSelectedItem] = useState<PlaylistItem | null>(null);

  useEffect(() => {
    loadItems();
  }, [playlist.id]);

  const loadItems = async () => {
    const items = await db.playlistItems
      .where('playlistId')
      .equals(playlist.id)
      .sortBy('pubDate');
    setItems(items);
  };

  const handleDelete = async () => {
    if (!confirm('确定删除此播放列表？')) return;
    
    await db.playlistItems.where('playlistId').equals(playlist.id).delete();
    await db.playlists.delete(playlist.id);
    onDelete();
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'downloaded': return 'text-green-600';
      case 'downloading': return 'text-blue-600';
      case 'failed': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <div className="card">
      {/* 播放列表信息 */}
      <div className="flex items-start gap-4">
        {playlist.cover && (
          <img
            src={playlist.cover}
            alt={playlist.name}
            className="w-24 h-24 rounded object-cover"
            referrerPolicy="no-referrer"
          />
        )}
        
        <div className="flex-1">
          <h3 className="text-xl font-bold">{playlist.name}</h3>
          <p className="text-gray-600">{playlist.uploaderName}</p>
          <p className="text-sm text-gray-500">{items.length} 个项目</p>
          {playlist.description && (
            <p className="text-sm text-gray-600 mt-2">{playlist.description}</p>
          )}
        </div>

        <div className="flex gap-2">
          <button onClick={() => setExpanded(!expanded)} className="btn-secondary">
            {expanded ? '收起' : '展开'}
          </button>
          <button onClick={handleDelete} className="btn-danger">
            删除
          </button>
        </div>
      </div>

      {/* 播放项列表 */}
      {expanded && (
        <div className="mt-4 space-y-2">
          {items.map(item => (
            <div
              key={item.id}
              className="flex items-center gap-3 p-3 border rounded hover:bg-gray-50"
            >
              <img
                src={item.cover}
                alt={item.title}
                className="w-16 h-16 rounded object-cover"
                referrerPolicy="no-referrer"
              />
              
              <div className="flex-1">
                <div className="font-medium">{item.title}</div>
                <div className="text-sm text-gray-500">
                  {formatDuration(item.duration)} · {item.bvid}
                </div>
              </div>

              <div className={`text-sm ${getStatusColor(item.downloadStatus)}`}>
                {item.downloadStatus}
              </div>

              {item.downloadStatus === 'downloaded' && item.audioUrl && (
                <button
                  onClick={() => setSelectedItem(item)}
                  className="btn-primary"
                >
                  测试播放
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 简单的音频播放器 */}
      {selectedItem && (
        <AudioPlayer
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  );
}
```

#### 简单音频播放器

```typescript
// components/AudioPlayer.tsx
import { useRef, useState, useEffect } from 'react';
import { PlaylistItem } from '../db';

interface Props {
  item: PlaylistItem;
  onClose: () => void;
}

export function AudioPlayer({ item, onClose }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleDurationChange = () => setDuration(audio.duration);
    const handleEnded = () => setPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      try {
        await audio.play();
        setPlaying(true);
      } catch (err) {
        alert('播放失败：' + err.message);
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    
    audio.currentTime = Number(e.target.value);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <div className="flex justify-between items-start mb-4">
          <h3 className="font-bold">{item.title}</h3>
          <button onClick={onClose} className="text-gray-500">✕</button>
        </div>

        <audio ref={audioRef} src={item.audioUrl} />

        <div className="space-y-4">
          <input
            type="range"
            min="0"
            max={duration || 0}
            value={currentTime}
            onChange={handleSeek}
            className="w-full"
          />

          <div className="flex justify-between text-sm text-gray-600">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>

          <button onClick={togglePlay} className="w-full btn-primary">
            {playing ? '暂停' : '播放'}
          </button>
        </div>

        <p className="text-xs text-gray-500 mt-4">
          这是一个简单的测试播放器，用于验证音频下载是否成功。
        </p>
      </div>
    </div>
  );
}
```

#### 下载状态页

```typescript
// pages/DownloadsPage.tsx
import { useState, useEffect } from 'react';
import { apiCall } from '../utils/api';

export function DownloadsPage() {
  const [downloads, setDownloads] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDownloads();
  }, []);

  const loadDownloads = async () => {
    try {
      const res = await apiCall('/api/downloads/list');
      setDownloads(res.items || []);
    } catch (err) {
      console.error('加载失败:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN');
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '-';
    const mb = bytes / 1024 / 1024;
    return `${mb.toFixed(2)} MB`;
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">下载队列</h1>
        <button onClick={loadDownloads} className="btn-secondary">
          刷新
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8">加载中...</div>
      ) : (
        <div className="space-y-2">
          {downloads.map(item => (
            <div key={item.id} className="card">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="font-medium">{item.title}</div>
                  <div className="text-sm text-gray-500">{item.bvid}</div>
                </div>

                <div className="text-right space-y-1">
                  <div className={`text-sm font-medium ${
                    item.status === 'downloaded' ? 'text-green-600' :
                    item.status === 'downloading' ? 'text-blue-600' :
                    item.status === 'failed' ? 'text-red-600' :
                    'text-gray-600'
                  }`}>
                    {item.status}
                  </div>
                  
                  {item.fileSize && (
                    <div className="text-xs text-gray-500">
                      {formatSize(item.fileSize)}
                    </div>
                  )}
                  
                  <div className="text-xs text-gray-400">
                    {formatDate(item.addedAt)}
                  </div>
                </div>
              </div>

              {item.error && (
                <div className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded">
                  {item.error}
                </div>
              )}

              {item.audioUrl && (
                <div className="mt-2">
                  <a
                    href={item.audioUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline"
                  >
                    查看音频文件 →
                  </a>
                </div>
              )}
            </div>
          ))}

          {downloads.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              暂无下载记录
            </div>
          )}
        </div>
      )}

      <div className="mt-8 p-4 bg-blue-50 rounded">
        <h3 className="font-bold mb-2">如何触发下载？</h3>
        <ol className="text-sm space-y-1 list-decimal list-inside">
          <li>前往GitHub仓库的 Actions 标签页</li>
          <li>选择 "Download Audio" workflow</li>
          <li>点击 "Run workflow" 按钮</li>
          <li>等待任务完成后，刷新此页面查看结果</li>
        </ol>
      </div>
    </div>
  );
}
```

### 5.3 API工具函数

```typescript
// utils/api.ts
const API_BASE = import.meta.env.VITE_API_BASE || '';

export async function apiCall(endpoint: string, options: RequestInit = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.statusText}`);
  }

  return response.json();
}
```

---

## 6. 后端实现

### 6.1 主入口

```typescript
// backend/src/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bilibiliRoutes } from './routes/bilibili';
import { downloadRoutes } from './routes/downloads';

type Bindings = {
  DB: D1Database;
  BUCKET: R2Bucket;
};

const app = new Hono<{ Bindings: Bindings }>();

// CORS（允许所有来源，因为没有认证）
app.use('*', cors());

// 健康检查
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: Date.now() });
});

// 路由
app.route('/api/bilibili', bilibiliRoutes);
app.route('/api/downloads', downloadRoutes);

export default app;
```

### 6.2 B站解析路由

```typescript
// backend/src/routes/bilibili.ts
import { Hono } from 'hono';
import { parseBilibili } from '../services/bilibili';

export const bilibiliRoutes = new Hono();

bilibiliRoutes.post('/parse', async (c) => {
  try {
    const { url } = await c.req.json();

    if (!url) {
      return c.json({ success: false, error: '缺少URL参数' }, 400);
    }

    const result = await parseBilibili(url);

    return c.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('解析失败:', error);
    return c.json({
      success: false,
      error: error.message || '解析失败'
    }, 500);
  }
});
```

### 6.3 下载路由

```typescript
// backend/src/routes/downloads.ts
import { Hono } from 'hono';
import { v4 as uuid } from 'uuid';

type Bindings = {
  DB: D1Database;
  BUCKET: R2Bucket;
};

export const downloadRoutes = new Hono<{ Bindings: Bindings }>();

// 添加到队列
downloadRoutes.post('/queue', async (c) => {
  try {
    const { items } = await c.req.json();

    if (!items || !Array.isArray(items)) {
      return c.json({ success: false, error: '无效的参数' }, 400);
    }

    const db = c.env.DB;
    const now = Date.now();
    let queuedCount = 0;

    for (const item of items) {
      try {
        // 检查是否已存在
        const existing = await db.prepare(
          'SELECT id FROM download_queue WHERE bvid = ?'
        ).bind(item.bvid).first();

        if (existing) {
          console.log(`跳过已存在的项目: ${item.bvid}`);
          continue;
        }

        // 插入新记录
        await db.prepare(`
          INSERT INTO download_queue (id, bvid, title, duration, status, added_at)
          VALUES (?, ?, ?, ?, 'pending', ?)
        `).bind(
          uuid(),
          item.bvid,
          item.title,
          item.duration,
          now
        ).run();

        queuedCount++;
      } catch (err) {
        console.error(`添加失败 ${item.bvid}:`, err);
      }
    }

    return c.json({
      success: true,
      queuedCount
    });

  } catch (error) {
    console.error('添加队列失败:', error);
    return c.json({
      success: false,
      error: error.message || '添加失败'
    }, 500);
  }
});

// 查询状态
downloadRoutes.get('/status', async (c) => {
  try {
    const bvids = c.req.query('bvids')?.split(',') || [];

    if (bvids.length === 0) {
      return c.json({ items: [] });
    }

    const db = c.env.DB;
    const placeholders = bvids.map(() => '?').join(',');
    const stmt = db.prepare(`
      SELECT bvid, status, audio_url, file_size, error_message
      FROM download_queue
      WHERE bvid IN (${placeholders})
    `).bind(...bvids);

    const result = await stmt.all();

    const items = result.results.map(row => ({
      bvid: row.bvid,
      status: row.status,
      audioUrl: row.audio_url,
      fileSize: row.file_size,
      error: row.error_message
    }));

    return c.json({ items });

  } catch (error) {
    console.error('查询状态失败:', error);
    return c.json({ items: [] }, 500);
  }
});

// 获取所有下载记录（用于调试）
downloadRoutes.get('/list', async (c) => {
  try {
    const db = c.env.DB;
    const result = await db.prepare(`
      SELECT *
      FROM download_queue
      ORDER BY added_at DESC
      LIMIT 100
    `).all();

    const items = result.results.map(row => ({
      id: row.id,
      bvid: row.bvid,
      title: row.title,
      status: row.status,
      audioUrl: row.audio_url,
      fileSize: row.file_size,
      error: row.error_message,
      addedAt: row.added_at,
      completedAt: row.completed_at
    }));

    return c.json({ items });

  } catch (error) {
    console.error('获取列表失败:', error);
    return c.json({ items: [] }, 500);
  }
});
```

### 6.4 B站解析服务（复用完整版）

```typescript
// backend/src/services/bilibili.ts
// 直接使用技术设计文档中的实现
// 参考 5.4 B站内容解析 部分
```

---

## 7. GitHub Actions 下载脚本

### 7.1 Workflow配置

```yaml
# .github/workflows/download-audio.yml
name: Download Audio (MVP)

on:
  workflow_dispatch:  # 仅手动触发

concurrency:
  group: download-audio
  cancel-in-progress: false

jobs:
  download:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      
      - name: Install dependencies
        run: |
          pip install yt-dlp boto3 requests
          sudo apt-get update
          sudo apt-get install -y ffmpeg
      
      - name: Download and Upload
        env:
          R2_ENDPOINT: ${{ secrets.R2_ENDPOINT }}
          R2_ACCESS_KEY: ${{ secrets.R2_ACCESS_KEY }}
          R2_SECRET_KEY: ${{ secrets.R2_SECRET_KEY }}
          R2_BUCKET: ${{ secrets.R2_BUCKET }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          D1_DATABASE_ID: ${{ secrets.D1_DATABASE_ID }}
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        run: python scripts/download_worker.py
```

### 7.2 下载脚本（复用完整版）

```python
# scripts/download_worker.py
# 直接使用技术设计文档中的实现
# 参考 5.5 GitHub Actions 下载脚本 部分
```

---

## 8. 部署配置

### 8.1 Cloudflare配置

```bash
# 1. 创建D1数据库
wrangler d1 create b-cast-mvp
# 记录 database_id

# 2. 初始化数据库
wrangler d1 execute b-cast-mvp --file=./scripts/download_queue.sql

# 3. 创建R2 bucket
wrangler r2 bucket create b-cast-audio

# 4. 配置R2公开访问（重要！）
# 在Cloudflare Dashboard中:
# R2 > b-cast-audio > Settings > Public Access
# 启用 "Allow Access" 并记录公开域名
```

### 8.2 wrangler.toml

```toml
name = "b-cast-mvp"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "b-cast-mvp"
database_id = "<your-database-id>"

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "b-cast-audio"
```

### 8.3 前端环境变量

```bash
# frontend/.env.development
VITE_API_BASE=http://localhost:8787

# frontend/.env.production
VITE_API_BASE=https://b-cast-mvp.your-subdomain.workers.dev
```

### 8.4 GitHub Secrets配置

在GitHub仓库 Settings > Secrets and variables > Actions 中添加：

```
R2_ENDPOINT=https://[account-id].r2.cloudflarestorage.com
R2_ACCESS_KEY=<从Cloudflare R2 > Manage R2 API Tokens 获取>
R2_SECRET_KEY=<从Cloudflare R2 > Manage R2 API Tokens 获取>
R2_BUCKET=b-cast-audio
CLOUDFLARE_ACCOUNT_ID=<从Cloudflare Dashboard URL中获取>
D1_DATABASE_ID=<从wrangler d1 create输出中获取>
CLOUDFLARE_API_TOKEN=<从Profile > API Tokens创建，需要D1 Edit权限>
```

---

## 9. 测试流程

### 9.1 本地测试

```bash
# 1. 启动后端
cd backend
npm install
wrangler dev --local  # localhost:8787

# 2. 启动前端
cd frontend
npm install
npm run dev  # localhost:5173

# 3. 测试B站解析
curl -X POST http://localhost:8787/api/bilibili/parse \
  -H "Content-Type: application/json" \
  -d '{"url": "https://space.bilibili.com/3493085779869"}' | jq
```

### 9.2 端到端测试

1. **添加播放列表**
   - 在前端输入B站URL
   - 验证解析结果是否正确
   - 检查播放列表和播放项是否保存到IndexedDB
   - 检查下载队列是否添加成功

2. **触发下载**
   - 前往GitHub仓库 Actions 标签页
   - 点击 "Download Audio (MVP)" workflow
   - 点击 "Run workflow" > "Run workflow"
   - 等待任务完成（查看日志）

3. **验证结果**
   - 刷新前端页面
   - 检查下载状态是否更新为 "downloaded"
   - 点击"测试播放"按钮
   - 验证音频是否可以正常播放

4. **检查R2存储**
   - 登录Cloudflare Dashboard
   - 进入 R2 > b-cast-audio
   - 查看 audio/ 目录下是否有对应的音频文件

---

## 10. 已知限制

### 10.1 技术限制

- **无认证**：任何人都可以访问和添加播放列表
- **无状态同步**：前端状态不会自动更新，需要手动刷新
- **R2访问**：需要配置公开访问，或使用预签名URL（更安全但更复杂）
- **B站限流**：频繁解析可能被B站限流，建议间隔使用

### 10.2 MVP简化

- **单用户**：所有数据共享，没有用户隔离
- **手动下载**：需要手动触发GitHub Actions
- **无更新检测**：不会检查播放列表更新
- **简单播放器**：只能测试播放，没有完整播放功能

---

## 11. 后续升级路径

完成MVP后，可按以下顺序升级为完整版：

### Phase 1: 认证和隔离
- [ ] 添加简单Token认证
- [ ] 多用户数据隔离

### Phase 2: 自动化
- [ ] 定时任务检查下载队列
- [ ] 自动触发GitHub Actions

### Phase 3: 完整播放器
- [ ] 播放历史记录
- [ ] 播放进度保存
- [ ] 播放列表循环/随机

### Phase 4: 高级功能
- [ ] 播放列表更新检测
- [ ] 音频预加载和缓存
- [ ] Media Session API集成
- [ ] PWA离线支持

---

## 12. 故障排查

### 12.1 常见问题

**Q: 解析B站URL失败**
- 检查URL格式是否正确
- 查看浏览器Console和网络请求
- 检查是否被B站限流（更换IP或等待）

**Q: 下载失败**
- 检查GitHub Actions日志
- 验证Secrets配置是否正确
- 检查yt-dlp是否需要更新
- 查看D1数据库中的error_message字段

**Q: 音频无法播放**
- 检查R2公开访问是否配置正确
- 验证audioUrl是否有效
- 检查浏览器Console错误信息
- 验证音频文件格式（应为m4a）

**Q: 前端无法连接后端**
- 检查VITE_API_BASE环境变量
- 验证CORS配置
- 检查Cloudflare Workers部署状态

### 12.2 调试工具

```bash
# 查看D1数据库
wrangler d1 execute b-cast-mvp --command "SELECT * FROM download_queue LIMIT 10"

# 查看R2文件列表
wrangler r2 object list b-cast-audio --prefix audio/

# 下载R2文件测试
wrangler r2 object get b-cast-audio/audio/BV1xx4y1x7xx.m4a --file test.m4a

# 查看Workers日志
wrangler tail
```

---

## 13. 成本估算

基于Cloudflare免费计划：

| 资源 | 免费额度 | MVP预估使用 | 是否足够 |
|------|---------|-----------|---------|
| Workers 请求 | 100,000/天 | < 1000/天 | ✅ 充足 |
| D1 存储 | 5GB | < 10MB | ✅ 充足 |
| D1 读操作 | 500万/天 | < 10,000/天 | ✅ 充足 |
| R2 存储 | 10GB | ~5GB | ⚠️ 够用 |
| R2 下载 | 10GB/月 | < 5GB/月 | ⚠️ 够用 |
| GitHub Actions | 2000分钟/月 | < 200分钟/月 | ✅ 充足 |

**建议：**
- MVP阶段控制在20-30个播放列表内
- 避免下载过长的音频（>1小时）
- 定期清理不需要的音频

---

## 14. 项目结构

```
b-cast/
├── frontend/                 # Vite + React
│   ├── src/
│   │   ├── components/
│   │   │   ├── AddPlaylist.tsx
│   │   │   ├── PlaylistCard.tsx
│   │   │   └── AudioPlayer.tsx
│   │   ├── pages/
│   │   │   ├── HomePage.tsx
│   │   │   └── DownloadsPage.tsx
│   │   ├── utils/
│   │   │   └── api.ts
│   │   ├── db.ts            # Dexie配置
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── public/
│   │   └── index.html
│   ├── .env.development
│   ├── .env.production
│   └── package.json
│
├── backend/                  # Hono API
│   ├── src/
│   │   ├── index.ts
│   │   ├── routes/
│   │   │   ├── bilibili.ts
│   │   │   └── downloads.ts
│   │   └── services/
│   │       └── bilibili.ts
│   ├── wrangler.toml
│   └── package.json
│
├── scripts/
│   ├── download_worker.py    # 下载脚本
│   └── download_queue.sql    # D1 Schema
│
├── .github/
│   └── workflows/
│       └── download-audio.yml
│
├── docs/
│   ├── technical-design.md   # 完整版设计文档
│   └── mvp-design.md         # 本文档
│
└── README.md
```

---

## 15. 快速开始

### 15.1 Fork仓库

```bash
# 1. Fork GitHub仓库
# 2. Clone到本地
git clone https://github.com/YOUR_USERNAME/B-Cast.git
cd B-Cast
```

### 15.2 配置Cloudflare

```bash
# 安装wrangler
npm install -g wrangler

# 登录
wrangler login

# 创建D1
wrangler d1 create b-cast-mvp
# 复制 database_id 到 backend/wrangler.toml

# 初始化数据库
wrangler d1 execute b-cast-mvp --file=./scripts/download_queue.sql

# 创建R2
wrangler r2 bucket create b-cast-audio

# 在Dashboard中配置R2公开访问
```

### 15.3 部署后端

```bash
cd backend
npm install
wrangler deploy

# 记录部署URL: https://b-cast-mvp.xxx.workers.dev
```

### 15.4 配置GitHub Secrets

在GitHub仓库设置中添加所有必需的Secrets（见8.4节）

### 15.5 部署前端

```bash
cd frontend

# 修改 .env.production
echo "VITE_API_BASE=https://b-cast-mvp.xxx.workers.dev" > .env.production

npm install
npm run build

# 部署到GitHub Pages或Cloudflare Pages
npm run deploy
```

### 15.6 测试

1. 访问前端URL
2. 添加一个B站播放列表
3. 前往GitHub Actions手动触发下载
4. 刷新页面，测试播放

---

**文档版本：** MVP v1.0  
**最后更新：** 2026-01-23  
**预计开发时间：** 2-3天  
**适用场景：** 快速验证核心功能，个人测试使用
