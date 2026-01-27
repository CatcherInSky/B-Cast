# 前端获取 R2 音频资源 URL 指南

## 概述

前端通过 Worker API 获取存储在 R2 上的音频文件。音频文件不直接公开访问，而是通过 Worker 的 `/api/downloads/audio/:bvid` 端点提供。

## 音频 URL 格式

音频文件的完整 URL 格式为：
```
{WORKER_URL}/api/downloads/audio/{bvid}
```

例如：
- 本地开发：`http://localhost:8787/api/downloads/audio/BV1YorvBxEsb`
- 生产环境：`https://your-worker.workers.dev/api/downloads/audio/BV1YorvBxEsb`

## 数据流程

### 1. 下载完成时
当音频文件下载完成并上传到 R2 后，后端会更新数据库：
- 表：`download_queue`
- 字段：`audio_url` = `{WORKER_URL}/api/downloads/audio/{bvid}`
- 状态：`status` = `'completed'`

### 2. 前端获取方式

#### 方式一：从 API 直接获取（DownloadsPage）
```typescript
// 从后端 API 获取下载列表
const res = await apiCall('/api/downloads/list');
// res.items[].audioUrl 已经包含完整的 Worker API URL
```

#### 方式二：从 IndexedDB 获取并同步（PlaylistCard）
```typescript
// 1. 从 IndexedDB 读取
const item = await db.playlistItems.where('bvid').equals(bvid).first();

// 2. 如果没有 audioUrl，从后端同步
if (!item.audioUrl) {
  await syncDownloadStatus(bvid);
  // 重新读取更新后的数据
}

// 3. 使用 audioUrl
<audio src={item.audioUrl} />
```

## 工具函数

### `syncDownloadStatus(bvid: string)`
同步单个视频的下载状态和音频 URL 到 IndexedDB。

### `syncMultipleDownloadStatus(bvids: string[])`
批量同步多个视频的下载状态。

### `getAudioUrl(bvid: string)`
获取音频文件的完整 URL，如果 IndexedDB 中没有则从后端获取。

### `buildAudioUrl(bvid: string, baseUrl?: string)`
构建音频文件的 Worker API URL（不依赖数据库）。

## 使用示例

### 在 DownloadsPage 中
```tsx
// 直接从 API 获取，audioUrl 已经包含完整 URL
{item.audioUrl && (
  <audio controls src={item.audioUrl} />
)}
```

### 在 PlaylistCard 中
```tsx
// 加载时自动同步下载状态
useEffect(() => {
  loadItems();
  // loadItems 内部会调用 syncMultipleDownloadStatus
}, [playlist.id]);

// 播放时确保有 audioUrl
<button onClick={async () => {
  let audioUrl = item.audioUrl;
  if (!audioUrl) {
    audioUrl = await getAudioUrl(item.bvid);
  }
  if (audioUrl) {
    setSelectedItem({ ...item, audioUrl });
  }
}}>
  播放
</button>
```

## 状态映射

后端状态 → 前端状态：
- `completed` → `downloaded`
- `downloading` → `downloading`
- `failed` → `failed`
- `pending` → `pending`

## 注意事项

1. **Worker URL 配置**
   - 确保 `VITE_API_BASE` 环境变量正确设置
   - 本地开发：`http://localhost:8787`
   - 生产环境：`https://your-worker.workers.dev`

2. **CORS 配置**
   - Worker 需要允许前端域名的跨域请求
   - 音频文件通过 Worker API 提供，不需要 R2 公开访问

3. **缓存策略**
   - IndexedDB 用于本地缓存，提高加载速度
   - 定期同步后端状态，确保数据最新

4. **错误处理**
   - 如果 `audioUrl` 为空，检查：
     - 下载是否完成（status === 'completed'）
     - Worker URL 是否正确配置
     - 后端 `/api/downloads/audio/:bvid` 端点是否正常

## 调试

如果音频无法播放，检查：
1. 浏览器控制台的网络请求，查看音频 URL 是否正确
2. Worker 日志，确认文件是否存在于 R2
3. 数据库中的 `audio_url` 字段是否正确设置
