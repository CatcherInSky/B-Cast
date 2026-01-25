# B-Cast API 文档

B-Cast MVP版本的API接口说明。

**Base URL:** `https://b-cast-mvp.your-subdomain.workers.dev`

## 认证

MVP版本不需要认证，所有接口公开访问。

## 接口列表

### 健康检查

```
GET /health
```

检查API服务状态。

**响应示例：**
```json
{
  "status": "ok",
  "timestamp": 1234567890
}
```

---

### 解析B站URL

```
POST /api/bilibili/parse
```

解析B站URL，返回播放列表和视频信息。

**支持的URL类型：**
- UP主空间：`https://space.bilibili.com/123456`
- 合集：`https://space.bilibili.com/123456/channel/collectiondetail?sid=789`
- 单个视频：`https://www.bilibili.com/video/BV1xx4y1x7xx`

**请求体：**
```json
{
  "url": "https://space.bilibili.com/3493085779869"
}
```

**成功响应：**
```json
{
  "success": true,
  "data": {
    "playlist": {
      "name": "UP主名称的投稿",
      "type": "uploader",
      "uploaderName": "UP主名称",
      "cover": "https://i0.hdslb.com/xxx.jpg",
      "description": "UP主的bilibili空间"
    },
    "items": [
      {
        "bvid": "BV1xx4y1x7xx",
        "title": "视频标题",
        "duration": 1234,
        "cover": "https://i0.hdslb.com/xxx.jpg",
        "pubDate": 1234567890000
      }
    ]
  }
}
```

**错误响应：**
```json
{
  "success": false,
  "error": "不支持的URL类型"
}
```

**错误码：**
- `400` - 缺少URL参数
- `500` - 解析失败（B站API错误、网络错误等）

---

### 添加到下载队列

```
POST /api/downloads/queue
```

批量添加视频到下载队列。

**请求体：**
```json
{
  "items": [
    {
      "bvid": "BV1xx4y1x7xx",
      "title": "视频标题",
      "duration": 1234
    },
    {
      "bvid": "BV1yy4y1y7yy",
      "title": "另一个视频",
      "duration": 5678
    }
  ]
}
```

**成功响应：**
```json
{
  "success": true,
  "queuedCount": 2
}
```

**说明：**
- 如果视频已存在于队列中，会自动跳过
- `queuedCount` 表示实际添加的数量

**错误响应：**
```json
{
  "success": false,
  "error": "无效的参数"
}
```

**错误码：**
- `400` - 参数格式错误
- `500` - 数据库错误

---

### 查询下载状态

```
GET /api/downloads/status?bvids=BV1xx,BV1yy,BV1zz
```

批量查询视频的下载状态。

**查询参数：**
- `bvids` - 用逗号分隔的BVID列表

**响应：**
```json
{
  "items": [
    {
      "bvid": "BV1xx4y1x7xx",
      "status": "downloaded",
      "audioUrl": "https://pub-xxxxx.r2.dev/audio/BV1xx4y1x7xx.m4a",
      "fileSize": 12345678
    },
    {
      "bvid": "BV1yy4y1y7yy",
      "status": "pending"
    },
    {
      "bvid": "BV1zz4y1z7zz",
      "status": "failed",
      "error": "yt-dlp download failed: ..."
    }
  ]
}
```

**状态说明：**
- `pending` - 等待下载
- `downloading` - 下载中
- `downloaded` - 已完成
- `failed` - 下载失败

---

### 获取下载列表

```
GET /api/downloads/list
```

获取所有下载记录（用于调试和监控）。

**响应：**
```json
{
  "items": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "bvid": "BV1xx4y1x7xx",
      "title": "视频标题",
      "status": "downloaded",
      "audioUrl": "https://pub-xxxxx.r2.dev/audio/BV1xx4y1x7xx.m4a",
      "fileSize": 12345678,
      "addedAt": 1234567890000,
      "completedAt": 1234567900000
    }
  ]
}
```

**说明：**
- 返回最近100条记录
- 按添加时间倒序排列

---

## 数据模型

### Playlist

```typescript
interface Playlist {
  name: string;           // 播放列表名称
  type: 'collection' | 'uploader';  // 类型
  uploaderName: string;   // UP主名称
  cover?: string;         // 封面URL
  description?: string;   // 描述
}
```

### PlaylistItem

```typescript
interface PlaylistItem {
  bvid: string;      // B站视频ID
  title: string;     // 标题
  duration: number;  // 时长（秒）
  cover: string;     // 封面URL
  pubDate: number;   // 发布时间（毫秒时间戳）
}
```

### DownloadQueueItem

```typescript
interface DownloadQueueItem {
  id: string;              // UUID
  bvid: string;            // B站视频ID
  title: string;           // 标题
  duration?: number;       // 时长（秒）
  status: 'pending' | 'downloading' | 'downloaded' | 'failed';
  audioUrl?: string;       // R2音频URL
  fileSize?: number;       // 文件大小（字节）
  error?: string;          // 错误信息
  addedAt: number;         // 添加时间（毫秒时间戳）
  completedAt?: number;    // 完成时间（毫秒时间戳）
}
```

---

## 错误处理

所有错误响应遵循以下格式：

```json
{
  "success": false,
  "error": "错误描述"
}
```

**HTTP状态码：**
- `200` - 成功
- `400` - 客户端错误（参数错误）
- `401` - 未认证（完整版使用）
- `500` - 服务器错误

---

## 限流

MVP版本暂无限流，但建议：
- 避免频繁调用解析接口（可能被B站限流）
- 批量添加队列时，建议每批不超过100个视频

---

## CORS

所有接口支持跨域访问：
```
Access-Control-Allow-Origin: *
```

---

## 测试

### 使用curl测试

```bash
# 健康检查
curl https://b-cast-mvp.your-subdomain.workers.dev/health

# 解析B站URL
curl -X POST https://b-cast-mvp.your-subdomain.workers.dev/api/bilibili/parse \
  -H "Content-Type: application/json" \
  -d '{"url": "https://space.bilibili.com/3493085779869"}'

# 添加到队列
curl -X POST https://b-cast-mvp.your-subdomain.workers.dev/api/downloads/queue \
  -H "Content-Type: application/json" \
  -d '{"items": [{"bvid": "BV1xx4y1x7xx", "title": "Test", "duration": 100}]}'

# 查询状态
curl "https://b-cast-mvp.your-subdomain.workers.dev/api/downloads/status?bvids=BV1xx4y1x7xx"

# 获取列表
curl https://b-cast-mvp.your-subdomain.workers.dev/api/downloads/list
```

---

## 性能指标

- 平均响应时间：< 100ms（解析接口除外）
- B站URL解析：1-5秒（取决于B站API响应）
- 支持并发：Cloudflare Workers自动扩展

---

## 更新日志

### v0.1.0 (2026-01-23)
- ✅ 初始版本
- ✅ B站URL解析
- ✅ 下载队列管理
- ✅ 状态查询

---

如有问题，请查看[部署文档](./DEPLOYMENT.md)或提交Issue。
