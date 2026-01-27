# 音频下载和播放指南

## 📥 下载的音频文件在哪里？

### 1. 本地开发环境（本地R2）

当使用 `pnpm dev:backend:local` 时，音频文件存储在：
- **本地 R2 模拟器**：`backend/.wrangler/state/v3/r2/` 目录下
- **存储格式**：Miniflare 使用 SQLite 存储文件元数据，实际文件内容存储在 `blobs/` 目录
- **重要**：文件名是内容的哈希值，不是原始路径（如 `audio/{bvid}.m4a`）

**为什么看不到 `audio/` 和 `rss/` 文件夹？**

Miniflare（本地 R2 模拟器）使用了一种特殊的存储格式：
- 文件元数据存储在 SQLite 数据库中：`backend/.wrangler/state/v3/r2/miniflare-R2BucketObject/*.sqlite`
- 文件内容存储在 `blobs/` 目录，文件名是内容的哈希值
- 原始路径（如 `rss/xxx.xml`、`audio/BVxxx.m4a`）存储在 SQLite 数据库中

**查看方式**：

1. **通过 Worker API**（推荐）：
   ```bash
   # 列出所有文件
   curl http://localhost:8787/api/downloads/list-r2
   
   # 列出 RSS 文件
   curl http://localhost:8787/api/downloads/list-r2?prefix=rss/
   
   # 列出音频文件
   curl http://localhost:8787/api/downloads/list-r2?prefix=audio/
   ```

2. **查看数据库中的文件路径**：
   ```bash
   # RSS URL 存储在 subscriptions 表
   cd backend
   pnpm exec wrangler d1 execute b-cast --local --command "SELECT id, rss_url FROM subscriptions;"
   
   # 音频 URL 存储在 download_queue 表
   pnpm exec wrangler d1 execute b-cast --local --command "SELECT bvid, audio_url FROM download_queue WHERE audio_url IS NOT NULL;"
   ```

3. **查看 Miniflare 的 SQLite 数据库**（高级）：
   ```bash
   # 使用 SQLite 工具查看
   sqlite3 backend/.wrangler/state/v3/r2/miniflare-R2BucketObject/*.sqlite
   # 然后执行: SELECT key, size FROM objects;
   ```

### 2. 生产环境（线上R2）

音频文件存储在 Cloudflare R2 存储桶中：
- **存储路径**：`audio/{bvid}.m4a`
- **访问方式**：通过 Worker API 访问

**查看方式**：
1. **Cloudflare Dashboard**：
   - 访问 https://dash.cloudflare.com/
   - 进入 R2 → 选择你的 bucket → 查看 `audio/` 目录

2. **命令行**：
   ```bash
   cd backend
   pnpm exec wrangler r2 object list b-cast --prefix audio/
   ```

## 🎵 前端如何展示和播放音频

### 1. 下载队列页面 (`/downloads`)

在下载队列页面 (`DownloadsPage.tsx`) 中：
- **显示下载状态**：待下载、下载中、已完成、失败
- **显示文件大小**：已完成的项目会显示文件大小
- **音频链接**：如果 `audioUrl` 存在，会显示"查看音频文件"链接

**状态说明**：
- `pending` - 待下载（灰色）
- `downloading` - 下载中（蓝色）
- `completed` - 已完成（绿色）
- `failed` - 失败（红色）

### 2. 播放列表页面 (`/`)

在播放列表页面 (`HomePage.tsx`) 中：
- **播放列表卡片** (`PlaylistCard.tsx`) 显示每个视频的下载状态
- **已下载的视频**：如果 `downloadStatus === 'downloaded'` 且有 `audioUrl`，会显示"测试播放"按钮
- **点击"测试播放"**：打开音频播放器 (`AudioPlayer.tsx`)

### 3. 音频播放器 (`AudioPlayer.tsx`)

音频播放器功能：
- **播放/暂停**：控制音频播放
- **进度条**：显示播放进度，支持拖拽跳转
- **时间显示**：显示当前时间和总时长
- **音频源**：从 `item.audioUrl` 加载音频

## 🔗 音频文件访问 URL

### API 端点

音频文件通过以下 API 访问：
```
GET /api/downloads/audio/:bvid
```

**示例**：
- 本地开发：`http://localhost:8787/api/downloads/audio/BV1ZizzBBEev`
- 生产环境：`https://your-worker.workers.dev/api/downloads/audio/BV1ZizzBBEev`

### URL 格式

下载完成后，`audioUrl` 字段会保存为：
- 格式：`{WORKER_URL}/api/downloads/audio/{bvid}`
- 示例：`https://b-cast.zhangchunxiang98.workers.dev/api/downloads/audio/BV1ZizzBBEev`

## 📋 完整流程

1. **添加订阅** → 前端调用 `/api/subscriptions/add`
2. **添加到下载队列** → 前端调用 `/api/downloads/queue`
3. **触发下载** → GitHub Actions 或手动运行下载脚本
4. **下载音频** → 使用 yt-dlp 下载到临时目录
5. **上传到R2** → 上传到 `audio/{bvid}.m4a`
6. **更新状态** → 调用 `/api/downloads/update-status` 更新状态和 `audioUrl`
7. **前端展示** → 下载队列页面显示状态和链接
8. **播放音频** → 点击播放按钮，通过 `/api/downloads/audio/:bvid` 访问

## 🛠️ 测试下载

### 本地测试

1. **启动本地服务**：
   ```bash
   pnpm dev:local
   ```

2. **添加订阅**：在前端添加一个 B站视频或UP主

3. **添加到下载队列**：在播放列表中点击"添加到下载队列"

4. **运行测试脚本**（需要实现实际下载逻辑）：
   ```bash
   pnpm test:download:local-to-local --limit 1
   ```

### 生产环境测试

1. **部署 Worker**：
   ```bash
   pnpm deploy
   ```

2. **触发 GitHub Actions**：
   - 访问 GitHub 仓库 → Actions
   - 选择 "Download Audio" workflow
   - 点击 "Run workflow"

3. **查看结果**：
   - 前端下载队列页面刷新查看状态
   - 或访问 Worker API：`/api/downloads/list`

## 💡 注意事项

1. **本地 R2 文件位置**：本地开发时，文件存储在 `.wrangler` 目录，重启服务可能会清空
2. **音频格式**：目前使用 m4a 格式（AAC编码，192kbps）
3. **文件大小**：音频文件大小取决于视频时长，通常几分钟的视频约 1-5MB
4. **缓存**：音频文件设置了 24 小时缓存，提高访问速度
5. **范围请求**：API 支持 HTTP Range 请求，支持音频播放器的跳转功能
