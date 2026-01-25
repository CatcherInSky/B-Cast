# B-Cast 技术设计文档

> 开源的个人PWA音频播放器，支持从B站自动下载和管理音频内容

---

## 1. 系统架构

### 1.1 整体架构

```
┌──────────────────────────────────────────────────────┐
│                    用户浏览器 (PWA)                    │
│                                                        │
│  IndexedDB (本地数据)           原生 Audio API        │
│  ├─ playlists                   ├─ 播放控制            │
│  ├─ playlist_items              ├─ 进度管理            │
│  ├─ play_history                └─ 音量控制            │
│  └─ config                                            │
└────────────┬───────────────────────────────┬─────────┘
             │ API (下载管理)                │ 直接访问
             ↓                               ↓
      ┌─────────────┐                  ┌─────────┐
      │  Cloudflare │                  │Cloudflare│
      │   Workers   │                  │   R2    │
      │   (Hono)    │                  │ (音频)   │
      └──────┬──────┘                  └─────────┘
             │
        ┌────┴────┐
        ↓         ↓
   ┌────────┐ ┌──────────────┐
   │   D1   │ │GitHub Actions│
   │(下载队列)│ │(下载Worker) │
   └────────┘ └──────────────┘
```

### 1.2 核心设计理念

- **前端存储**：播放列表、历史记录存在IndexedDB，零延迟访问
- **后端轻量**：D1只管理下载队列，不存储用户数据
- **极简依赖**：6个运行时依赖，原生API优先
- **PWA离线**：完全离线可用，真正的渐进式应用

---

## 2. 技术栈

monorepo - pnpm进行管理

### 2.1 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18.x | UI框架 |
| TypeScript | 5.x | 类型安全 |
| Vite | 5.x | 构建工具 |
| TailwindCSS | 3.x | 样式 |
| Dexie.js | 3.x | IndexedDB封装 |
| Zustand | 4.x | 状态管理 |
| React Router | 6.x | 路由 |
| vite-plugin-pwa | 0.17.x | PWA支持 |

**运行时依赖：** 仅6个

### 2.2 后端

| 技术 | 用途 |
|------|------|
| Cloudflare Workers | API服务 |
| Hono | 轻量路由框架 |
| Cloudflare D1 | 下载队列数据库 |
| Cloudflare R2 | 音频存储 |

### 2.3 下载Worker（GitHub Actions）

| 技术 | 用途 |
|------|------|
| GitHub Actions | 执行环境（Ubuntu） |
| Python 3.11 | 脚本语言 |
| yt-dlp | B站音频下载 |
| boto3 | R2上传（通过S3兼容API） |
| requests | 访问Cloudflare API查询D1 |

**注意：** boto3只在GitHub Actions中使用，Cloudflare Workers使用R2 Bindings

---

## 3. 数据模型

### 3.1 前端 IndexedDB Schema

```typescript
// db.ts
import Dexie, { Table } from 'dexie';

export interface Playlist {
  id: string;
  name: string;
  type: 'collection' | 'uploader';
  bilibiliUrl: string;
  uploaderName: string;
  cover?: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PlaylistItem {
  id: string;
  playlistId: string;
  bvid: string;
  title: string;
  duration: number;
  cover: string;  // B站URL，不下载
  pubDate: number;
  downloadStatus: 'pending' | 'downloading' | 'downloaded' | 'failed' | 'deleted';
  audioUrl?: string;
  fileSize?: number;
  played: boolean;
  playCount: number;
  lastPlayedAt?: number;
  addedAt: number;
}

export interface PlayHistory {
  id: string;
  itemId: string;
  playlistId: string;
  bvid: string;
  progress: number;
  duration: number;
  percentage: number;
  startedAt: number;
  lastPlayedAt: number;
  completedAt?: number;
}

export interface UserConfig {
  key: string;
  value: any;
}

export class BCastDB extends Dexie {
  playlists!: Table<Playlist>;
  playlistItems!: Table<PlaylistItem>;
  playHistory!: Table<PlayHistory>;
  config!: Table<UserConfig>;
  
  constructor() {
    super('b-cast-db');
    this.version(1).stores({
      playlists: 'id, name, type, createdAt',
      playlistItems: 'id, playlistId, bvid, downloadStatus, played, lastPlayedAt, addedAt',
      playHistory: 'id, itemId, playlistId, bvid, lastPlayedAt',
      config: 'key'
    });
  }
}

export const db = new BCastDB();
```

### 3.2 后端 D1 Schema

```sql
-- download_queue (核心表)
CREATE TABLE download_queue (
  id TEXT PRIMARY KEY,
  bvid TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  duration INTEGER,
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'pending',
  audio_url TEXT,
  file_size INTEGER,
  audio_format TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_attempt INTEGER,
  error_message TEXT,
  added_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE INDEX idx_queue_status ON download_queue(status);
CREATE INDEX idx_queue_priority_status ON download_queue(priority, status);
CREATE INDEX idx_queue_bvid ON download_queue(bvid);

-- download_stats (可选)
CREATE TABLE download_stats (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### 3.3 R2 存储结构

```
b-cast-audio/
└── audio/
    ├── BV1xx4y1x7xx.m4a
    ├── BV1yy4y1y7yy.m4a
    └── ...

注意：封面图片不下载，直接使用B站URL
```

---

## 4. API 设计

### 4.1 认证

```typescript
// 简单Token认证
Authorization: Bearer {AUTH_TOKEN}
```

### 4.2 核心接口

#### POST /api/bilibili/parse
解析B站URL，返回播放列表数据

```typescript
// Request
{
  url: string;  // B站URL
}

// Response
{
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
}
```

#### POST /api/downloads/queue
批量添加到下载队列

```typescript
// Request
{
  items: Array<{
    bvid: string;
    title: string;
    duration: number;
    priority?: 'immediate' | 'normal';
  }>
}

// Response
{
  success: boolean;
  queuedCount: number;
  downloadTriggered: boolean;
}
```

#### GET /api/downloads/status
查询下载状态

```typescript
// Request Query
?bvids=BV1xx,BV1yy,BV1zz

// Response
{
  items: Array<{
    bvid: string;
    status: 'pending' | 'downloading' | 'completed' | 'failed';
    audioUrl?: string;
    fileSize?: number;
    error?: string;
  }>
}
```

#### POST /api/downloads/trigger
手动触发下载任务

```typescript
// Response
{
  success: boolean;
  workflowId?: string;
}
```

---

## 5. 核心功能实现

### 5.1 认证模块

#### 后端实现 (Hono)

```typescript
// backend/src/middleware/auth.ts
import { Context, Next } from 'hono';

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  const token = authHeader.substring(7);
  
  if (token !== c.env.AUTH_TOKEN) {
    return c.json({ error: 'Invalid token' }, 401);
  }
  
  await next();
}

// backend/src/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authMiddleware } from './middleware/auth';

const app = new Hono();

app.use('*', cors());

// 登录接口（不需要认证）
app.post('/api/auth/login', async (c) => {
  const { token } = await c.req.json();
  
  if (token === c.env.AUTH_TOKEN) {
    return c.json({
      success: true,
      token: c.env.AUTH_TOKEN
    });
  }
  
  return c.json({ success: false, error: 'Invalid token' }, 401);
});

// 其他接口需要认证
app.use('/api/*', authMiddleware);

// ... 其他路由
```

#### 前端实现

```typescript
// services/auth.ts
const TOKEN_KEY = 'b-cast-auth-token';

export class AuthService {
  static async login(token: string): Promise<boolean> {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      
      const data = await response.json();
      
      if (data.success) {
        localStorage.setItem(TOKEN_KEY, data.token);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    }
  }
  
  static logout() {
    localStorage.removeItem(TOKEN_KEY);
  }
  
  static getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }
  
  static isAuthenticated(): boolean {
    return !!this.getToken();
  }
}

// utils/api.ts
export async function apiCall(endpoint: string, options: RequestInit = {}) {
  const token = AuthService.getToken();
  
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (response.status === 401) {
    // Token过期或无效，跳转到登录页
    AuthService.logout();
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  
  return response;
}
```

#### 登录页面

```typescript
// pages/LoginPage.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthService } from '../services/auth';

export function LoginPage() {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    const success = await AuthService.login(token);
    
    if (success) {
      navigate('/');
    } else {
      setError('Token无效，请检查后重试');
    }
    
    setLoading(false);
  };
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
        <div>
          <h2 className="text-3xl font-bold text-center">B-Cast</h2>
          <p className="mt-2 text-center text-gray-600">
            输入访问Token登录
          </p>
        </div>
        
        <form onSubmit={handleLogin} className="mt-8 space-y-6">
          <div>
            <label htmlFor="token" className="sr-only">Token</label>
            <input
              id="token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="访问Token"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          
          {error && (
            <div className="text-red-600 text-sm text-center">
              {error}
            </div>
          )}
          
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md disabled:opacity-50"
          >
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
        
        <div className="text-sm text-gray-500 text-center">
          <p>Token配置在部署时的环境变量中</p>
          <p className="mt-1">生成方式: <code className="bg-gray-100 px-1 rounded">openssl rand -base64 32</code></p>
        </div>
      </div>
    </div>
  );
}
```

#### 路由保护

```typescript
// App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthService } from './services/auth';
import { LoginPage } from './pages/LoginPage';
import { PlayerPage } from './pages/PlayerPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!AuthService.isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <PlayerPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/playlists"
          element={
            <ProtectedRoute>
              <PlaylistsPage />
            </ProtectedRoute>
          }
        />
        {/* 其他受保护的路由 */}
      </Routes>
    </BrowserRouter>
  );
}
```

#### Token生成和配置

**生成Token：**
```bash
# 生成一个安全的随机token
openssl rand -base64 32
# 输出示例: Kx7vJ9mN2pQ5wR8tY3uI6oL1aS4dF7gH9jK0lZ2xC5vB8nM1qW4e
```

**配置到Cloudflare：**
```bash
wrangler secret put AUTH_TOKEN
# 粘贴生成的token
```

**部署文档中说明：**
```markdown
## 首次部署配置

1. 生成访问Token:
   ```bash
   openssl rand -base64 32
   ```

2. 保存Token到Cloudflare Workers:
   ```bash
   wrangler secret put AUTH_TOKEN
   ```

3. 将Token保存在安全的地方（如密码管理器）

4. 访问应用时使用此Token登录
```

---

### 5.2 音频播放器 (原生 Audio API)

```typescript
// hooks/useAudioPlayer.ts
import { useState, useRef, useEffect } from 'react';

export function useAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState({
    playing: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    loading: false,
    error: null as string | null
  });

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    const handleTimeUpdate = () => {
      setState(s => ({ ...s, currentTime: audio.currentTime }));
    };
    const handleDurationChange = () => {
      setState(s => ({ ...s, duration: audio.duration }));
    };
    const handleEnded = () => {
      setState(s => ({ ...s, playing: false }));
    };
    const handleLoadStart = () => {
      setState(s => ({ ...s, loading: true, error: null }));
    };
    const handleCanPlay = () => {
      setState(s => ({ ...s, loading: false }));
    };
    const handleError = () => {
      setState(s => ({ ...s, loading: false, error: '加载失败' }));
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('loadstart', handleLoadStart);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('loadstart', handleLoadStart);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('error', handleError);
      audio.pause();
      audio.src = '';
    };
  }, []);

  const play = async () => {
    try {
      await audioRef.current?.play();
      setState(s => ({ ...s, playing: true }));
    } catch (error) {
      setState(s => ({ ...s, error: '播放失败' }));
    }
  };

  const pause = () => {
    audioRef.current?.pause();
    setState(s => ({ ...s, playing: false }));
  };

  const load = (url: string) => {
    if (audioRef.current) {
      audioRef.current.src = url;
      audioRef.current.load();
    }
  };

  const seek = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const setVolume = (volume: number) => {
    if (audioRef.current) {
      audioRef.current.volume = Math.max(0, Math.min(1, volume));
      setState(s => ({ ...s, volume }));
    }
  };

  return { ...state, play, pause, load, seek, setVolume };
}
```

### 5.3 图片处理 (不下载封面)

```typescript
// components/CoverImage.tsx
interface CoverImageProps {
  src: string;
  alt: string;
  size?: 'small' | 'medium' | 'large';
}

export function CoverImage({ src, alt, size = 'medium' }: CoverImageProps) {
  const sizeMap = {
    small: '@200w_200h.jpg',
    medium: '@400w_400h.jpg',
    large: '@800w_800h.jpg'
  };
  
  const optimizedSrc = src.includes('hdslb.com') 
    ? src + sizeMap[size]
    : src;
  
  return (
    <img
      src={optimizedSrc}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={(e) => {
        e.currentTarget.src = '/placeholder.jpg';
      }}
    />
  );
}
```

**index.html 必须添加：**
```html
<meta name="referrer" content="no-referrer">
```

### 5.4 B站内容解析

**参考：** [RSSHub B站路由实现](https://github.com/DIYgod/RSSHub/tree/master/lib/routes/bilibili)

#### 核心API端点

```typescript
// services/bilibili.ts

// 1. UP主视频列表
// https://github.com/DIYgod/RSSHub/blob/master/lib/routes/bilibili/video.ts
const UP_VIDEO_API = 'https://api.bilibili.com/x/space/wbi/arc/search';

// 2. UP主合集
// https://github.com/DIYgod/RSSHub/blob/master/lib/routes/bilibili/user-collection.ts
const COLLECTION_API = 'https://api.bilibili.com/x/polymer/web-space/seasons_archives_list';

// 3. UP主信息
const USER_INFO_API = 'https://api.bilibili.com/x/space/acc/info';
```

#### 解析实现

```typescript
// services/bilibili.ts
interface BilibiliVideo {
  bvid: string;
  aid: number;
  title: string;
  pic: string;
  author: string;
  created?: number;
  pubdate?: number;
  length?: string;
  duration?: number;
  description?: string;
}

export async function parseBilibili(url: string) {
  if (url.includes('collectiondetail')) {
    return parseCollection(url);
  } else if (url.includes('space.bilibili.com')) {
    return parseUploader(url);
  } else if (url.includes('/video/')) {
    return parseSingleVideo(url);
  }
  
  throw new Error('不支持的URL类型');
}

// 解析合集
// 参考：https://github.com/DIYgod/RSSHub/blob/master/lib/routes/bilibili/user-collection.ts
async function parseCollection(url: string) {
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
        'Referer': link,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    }
  );
  
  const data = await response.json();
  
  if (data.code !== 0) {
    throw new Error(`B站API错误: ${data.message}`);
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
      pubDate: item.pubdate ? item.pubdate * 1000 : Date.now(),
      description: ''
    }))
  };
}

// 解析UP主空间
// 参考：https://github.com/DIYgod/RSSHub/blob/master/lib/routes/bilibili/video.ts
async function parseUploader(url: string) {
  const uid = url.match(/space\.bilibili\.com\/(\d+)/)?.[1];
  
  if (!uid) {
    throw new Error('无效的UP主URL');
  }
  
  // 1. 获取UP主信息
  const userResponse = await fetch(
    `${USER_INFO_API}?mid=${uid}`,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    }
  );
  
  const userData = await userResponse.json();
  
  if (userData.code !== 0) {
    throw new Error(`获取UP主信息失败: ${userData.message}`);
  }
  
  const name = userData.data.name;
  const face = userData.data.face;
  
  // 2. 获取视频列表
  // 注意：这里简化了WBI签名验证，生产环境需要完整实现
  const videoResponse = await fetch(
    `${UP_VIDEO_API}?mid=${uid}&ps=30&tid=0&pn=1&keyword=&order=pubdate&platform=web`,
    {
      headers: {
        'Referer': `https://space.bilibili.com/${uid}`,
        'Origin': 'https://space.bilibili.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    }
  );
  
  const videoData = await videoResponse.json();
  
  if (videoData.code !== 0) {
    throw new Error(`获取视频列表失败: ${videoData.message}`);
  }
  
  const videos = videoData.data?.list?.vlist || [];
  
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
      pubDate: item.created ? item.created * 1000 : Date.now(),
      description: item.description || ''
    }))
  };
}

// 解析单个视频
async function parseSingleVideo(url: string) {
  const bvid = url.match(/\/video\/(BV\w+)/)?.[1];
  
  if (!bvid) {
    throw new Error('无效的视频URL');
  }
  
  // 获取视频信息
  const response = await fetch(
    `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,
    {
      headers: {
        'Referer': 'https://www.bilibili.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    }
  );
  
  const data = await response.json();
  
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
      pubDate: video.pubdate * 1000,
      description: video.desc
    }]
  };
}

// 工具函数：解析时长字符串 "mm:ss" 为秒数
function parseDuration(length: string): number {
  const parts = length.split(':').map(Number);
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}
```

#### 重要说明

**1. WBI签名验证（可选但推荐）**

RSSHub使用了WBI签名验证来提高稳定性，生产环境建议实现：

```typescript
// 参考 RSSHub 的实现
// https://github.com/DIYgod/RSSHub/blob/master/lib/routes/bilibili/utils.ts

// 简化版：不实现WBI签名也能工作，但可能被限流
// 完整版：参考RSSHub的cache.getWbiVerifyString()实现
```

**2. Cookie管理（可选）**

对于某些受限内容，可能需要Cookie：

```typescript
// RSSHub的做法是缓存Cookie
// 对于个人使用，可以配置环境变量
const cookie = process.env.BILIBILI_COOKIE || '';
```

**3. 错误处理**

```typescript
// B站API常见错误码
// -400: 请求错误
// -404: 视频不存在
// -403: 权限不足
// -412: 请求被拦截（需要验证）
```

**4. 分页处理**

```typescript
// UP主可能有很多视频，需要分页
async function getAllVideos(uid: string, maxPages: number = 5) {
  const allVideos = [];
  
  for (let page = 1; page <= maxPages; page++) {
    const response = await fetch(
      `${UP_VIDEO_API}?mid=${uid}&ps=30&pn=${page}&order=pubdate`
    );
    const data = await response.json();
    
    if (!data.data?.list?.vlist?.length) break;
    
    allVideos.push(...data.data.list.vlist);
    
    // 检查是否还有更多
    const total = data.data.page.count;
    if (allVideos.length >= total) break;
  }
  
  return allVideos;
}
```

### 5.5 GitHub Actions 下载脚本

**环境：** GitHub Actions（Ubuntu），支持Python

**为什么用boto3？** R2兼容S3 API，boto3是AWS官方Python SDK，稳定可靠

```python
# scripts/download_worker.py
import os
import json
import requests
import boto3  # AWS S3 SDK，R2兼容S3 API
from yt_dlp import YoutubeDL
from datetime import datetime

# 初始化S3客户端（连接到R2）
# R2完全兼容S3 API，所以可以用boto3
s3 = boto3.client(
    's3',
    endpoint_url=os.environ['R2_ENDPOINT'],
    aws_access_key_id=os.environ['R2_ACCESS_KEY'],
    aws_secret_access_key=os.environ['R2_SECRET_KEY']
)

ACCOUNT_ID = os.environ['CLOUDFLARE_ACCOUNT_ID']
DATABASE_ID = os.environ['D1_DATABASE_ID']
API_TOKEN = os.environ['CLOUDFLARE_API_TOKEN']
BUCKET = os.environ['R2_BUCKET']

def query_d1(sql, params=None):
    """查询D1数据库"""
    response = requests.post(
        f'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/d1/database/{DATABASE_ID}/query',
        headers={
            'Authorization': f'Bearer {API_TOKEN}',
            'Content-Type': 'application/json'
        },
        json={'sql': sql, 'params': params or []}
    )
    response.raise_for_status()
    return response.json()['result'][0]

def download_audio(bvid):
    """使用yt-dlp下载B站音频"""
    url = f'https://www.bilibili.com/video/{bvid}'
    
    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': f'/tmp/{bvid}.%(ext)s',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'm4a',
            'preferredquality': '192',
        }],
    }
    
    with YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])
    
    return f'/tmp/{bvid}.m4a'

def main():
    # 1. 查询待下载队列
    result = query_d1("""
        SELECT * FROM download_queue 
        WHERE status = 'pending'
        ORDER BY 
            CASE priority WHEN 'immediate' THEN 0 ELSE 1 END,
            added_at ASC
        LIMIT 50
    """)
    
    queue_items = result['results']
    if not queue_items:
        print("✅ No pending downloads")
        return
    
    print(f"📥 Found {len(queue_items)} items to download")
    
    for item in queue_items:
        try:
            # 2. 更新状态为downloading
            now = int(datetime.now().timestamp() * 1000)
            query_d1(
                "UPDATE download_queue SET status = 'downloading', last_attempt = ? WHERE id = ?",
                [now, item['id']]
            )
            
            # 3. 下载音频
            audio_path = download_audio(item['bvid'])
            file_size = os.path.getsize(audio_path)
            
            # 4. 上传到R2
            audio_key = f"audio/{item['bvid']}.m4a"
            s3.upload_file(audio_path, BUCKET, audio_key)
            audio_url = f"https://pub-{BUCKET}.r2.dev/{audio_key}"
            
            # 5. 更新状态为completed
            query_d1("""
                UPDATE download_queue 
                SET status = 'completed',
                    audio_url = ?,
                    file_size = ?,
                    audio_format = 'm4a',
                    completed_at = ?
                WHERE id = ?
            """, [audio_url, file_size, now, item['id']])
            
            print(f"✅ Downloaded: {item['bvid']} ({file_size / 1024 / 1024:.2f}MB)")
            os.remove(audio_path)
            
        except Exception as e:
            print(f"❌ Failed: {item['bvid']} - {e}")
            query_d1(
                "UPDATE download_queue SET status = 'failed', retry_count = retry_count + 1, error_message = ? WHERE id = ?",
                [str(e)[:500], item['id']]
            )

if __name__ == '__main__':
    main()
```

### 5.6 GitHub Actions Workflow

```yaml
# .github/workflows/download-audio.yml
name: Download Audio

on:
  repository_dispatch:
    types: [download-audio]
  schedule:
    - cron: '0 2 * * *'
  workflow_dispatch:

concurrency:
  group: download-audio
  cancel-in-progress: false

jobs:
  download:
    runs-on: ubuntu-latest
    timeout-minutes: 360
    
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

### 5.7 Media Session API (PWA)

```typescript
// hooks/useMediaSession.ts
import { useEffect } from 'react';

export function useMediaSession(
  track: PlaylistItem | null,
  audio: ReturnType<typeof useAudioPlayer>
) {
  useEffect(() => {
    if (!track || !('mediaSession' in navigator)) return;
    
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.uploaderName,
      artwork: [
        { src: track.cover, sizes: '512x512', type: 'image/jpeg' }
      ]
    });
    
    navigator.mediaSession.setActionHandler('play', () => audio.play());
    navigator.mediaSession.setActionHandler('pause', () => audio.pause());
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime) audio.seek(details.seekTime);
    });
  }, [track, audio]);
}
```

---

## 6. 部署配置

### 6.1 Cloudflare 配置

```bash
# 1. 安装 wrangler
npm install -g wrangler

# 2. 登录
wrangler login

# 3. 创建 D1 数据库
wrangler d1 create b-cast-db
# 记录 database_id

# 4. 初始化数据库
wrangler d1 execute b-cast-db --file=./schema.sql

# 5. 创建 R2 bucket
wrangler r2 bucket create b-cast-audio

# 6. 配置 secrets
wrangler secret put AUTH_TOKEN
wrangler secret put GITHUB_TOKEN
wrangler secret put GITHUB_REPO
```

### 6.2 GitHub Secrets 配置

在仓库设置中添加：

```
R2_ENDPOINT=https://[account-id].r2.cloudflarestorage.com
R2_ACCESS_KEY=<从Cloudflare R2获取>
R2_SECRET_KEY=<从Cloudflare R2获取>
R2_BUCKET=b-cast-audio
CLOUDFLARE_ACCOUNT_ID=<Account ID>
D1_DATABASE_ID=<Database ID>
CLOUDFLARE_API_TOKEN=<API Token>
```

### 6.3 wrangler.toml

```toml
name = "b-cast-api"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "b-cast-db"
database_id = "<your-database-id>"

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "b-cast-audio"

[triggers]
crons = ["0 2 * * *"]
```

### 6.4 部署命令

```bash
# 前端部署
cd frontend
npm run build
npm run deploy  # 部署到 GitHub Pages

# 后端部署
cd backend
wrangler deploy
```

---

## 7. 项目结构

```
b-cast/
├── frontend/                 # Vite + React PWA
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── db.ts            # Dexie配置
│   │   └── main.tsx
│   ├── public/
│   │   └── index.html       # 必须添加 meta referrer
│   └── package.json
│
├── backend/                  # Hono API
│   ├── src/
│   │   ├── index.ts
│   │   ├── routes/
│   │   ├── services/
│   │   └── utils/
│   └── wrangler.toml
│
├── scripts/
│   └── download_worker.py    # 下载脚本
│
├── .github/
│   └── workflows/
│       └── download-audio.yml
│
├── schema.sql                # D1 schema
└── README.md
```

---

## 8. 开发指南

### 8.1 本地开发

```bash
# 前端
cd frontend
npm install
npm run dev  # localhost:5173

# 后端
cd backend
npm install
wrangler dev  # localhost:8787

# 配置代理（frontend vite.config.ts）
export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://localhost:8787'
    }
  }
})
```

### 8.2 必需的依赖包

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.20.0",
    "dexie": "^3.2.4",
    "dexie-react-hooks": "^1.1.7",
    "zustand": "^4.4.7"
  }
}
```

---

## 9. 性能指标

| 指标 | 目标值 |
|------|--------|
| 首次加载 | < 2s |
| 播放列表切换 | < 50ms |
| 音频播放启动 | < 500ms |
| API响应时间 | < 100ms |
| PWA离线可用 | 100% |

---

## 10. 容量规划

| 资源 | 免费额度 | 估算使用 |
|------|---------|---------|
| Cloudflare D1 | 5GB, 500万读/天 | < 1MB, 1000读/天 |
| Cloudflare R2 | 10GB | 音频存储100% |
| GitHub Actions | 2000分钟/月 | < 500分钟/月 |
| IndexedDB | ~500MB | 用户数据 |

**音频容量估算：**
- 30分钟 ≈ 25MB
- 10GB ≈ 400个30分钟音频
- ≈ 200小时内容

---

**文档版本：** v1.0  
**最后更新：** 2026-01-23
