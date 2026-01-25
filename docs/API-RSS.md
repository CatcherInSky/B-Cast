# B-Cast RSS订阅功能 - API接口更新

本文档说明RSS订阅功能新增的API接口。

---

## 新增接口

### 1. 添加订阅

```
POST /api/subscriptions/add
```

**说明**: 将B站URL添加为RSS订阅，自动解析视频列表并生成RSS XML文件。

**请求体**:
```json
{
  "url": "https://space.bilibili.com/3493085779869"
}
```

**成功响应**:
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "UP主的投稿",
    "rssUrl": "https://b-cast-mvp.your-subdomain.workers.dev/api/subscriptions/rss/550e8400-....xml",
    "itemCount": 25
  }
}
```

**错误响应**:
```json
{
  "success": false,
  "error": "该订阅已存在"
}
```

---

### 2. 获取订阅列表

```
GET /api/subscriptions/list
```

**说明**: 获取所有订阅及其统计信息。

**响应**:
```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "UP主的投稿",
      "type": "uploader",
      "bilibili_url": "https://space.bilibili.com/3493085779869",
      "rss_url": "https://b-cast-mvp.your-subdomain.workers.dev/api/subscriptions/rss/550e8400-....xml",
      "uploader_name": "UP主名称",
      "cover": "https://i0.hdslb.com/xxx.jpg",
      "enabled": 1,
      "item_count": 25,
      "downloaded_count": 10,
      "last_check_at": 1737705600000,
      "created_at": 1737619200000,
      "updated_at": 1737619200000
    }
  ]
}
```

---

### 3. 获取订阅详情

```
GET /api/subscriptions/:id
```

**说明**: 获取单个订阅的详细信息，包括所有视频项。

**响应**:
```json
{
  "success": true,
  "data": {
    "subscription": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "UP主的投稿",
      "type": "uploader",
      "bilibili_url": "https://space.bilibili.com/3493085779869",
      "rss_url": "https://...",
      "uploader_name": "UP主名称",
      "enabled": 1,
      "created_at": 1737619200000
    },
    "items": [
      {
        "id": "item-uuid-1",
        "subscription_id": "550e8400-...",
        "bvid": "BV1xx4y1x7xx",
        "title": "视频标题",
        "duration": 930,
        "cover": "https://i0.hdslb.com/xxx.jpg",
        "pub_date": 1737619200000,
        "download_status": "downloaded",
        "audio_url": "https://pub-xxxxx.r2.dev/audio/BV1xx4y1x7xx.m4a",
        "file_size": 12345678,
        "added_at": 1737619200000
      }
    ]
  }
}
```

---

### 4. 手动刷新订阅

```
POST /api/subscriptions/refresh/:id
```

**说明**: 强制刷新指定订阅，检查是否有新视频。

**响应**:
```json
{
  "success": true,
  "data": {
    "newItemCount": 3,
    "totalItemCount": 28
  }
}
```

---

### 5. 删除订阅

```
DELETE /api/subscriptions/:id
```

**说明**: 删除订阅（会级联删除所有相关项和RSS文件）。

**响应**:
```json
{
  "success": true,
  "message": "订阅已删除"
}
```

---

### 6. 切换订阅启用状态

```
POST /api/subscriptions/toggle/:id
```

**说明**: 启用或禁用订阅的自动更新。

**响应**:
```json
{
  "success": true,
  "data": {
    "enabled": true
  }
}
```

---

### 7. 获取RSS XML

```
GET /api/subscriptions/rss/:filename
```

**说明**: 直接获取RSS XML文件内容（用于RSS阅读器订阅）。

**响应**: 
- Content-Type: `application/xml; charset=utf-8`
- Cache-Control: `public, max-age=3600`

**示例**:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>UP主的投稿</title>
    ...
  </channel>
</rss>
```

---

## 数据模型

### Subscription

```typescript
interface Subscription {
  id: string;
  name: string;
  type: 'collection' | 'uploader' | 'video';
  bilibili_url: string;
  rss_url: string;
  uploader_name: string;
  cover?: string;
  description?: string;
  last_check_at?: number;
  last_video_bvid?: string;
  last_video_pubdate?: number;
  enabled: number;  // 1=启用, 0=禁用
  created_at: number;
  updated_at: number;
}
```

### SubscriptionItem

```typescript
interface SubscriptionItem {
  id: string;
  subscription_id: string;
  bvid: string;
  title: string;
  duration: number;
  cover: string;
  pub_date: number;
  download_queue_id?: string;
  added_at: number;
}
```

---

## 自动更新机制

### 定时任务（Cron Trigger）

- **执行频率**: 每天凌晨2点（UTC）
- **配置文件**: `backend/wrangler.toml`
- **Cron表达式**: `0 2 * * *`

### 工作流程

1. 查询所有 `enabled=1` 的订阅
2. 依次解析每个订阅的B站URL
3. 对比数据库，找出新增视频
4. 将新视频添加到 `subscription_items` 和 `download_queue`
5. 重新生成RSS XML（包含已下载的音频URL）
6. 更新RSS文件到R2
7. 更新 `last_check_at` 时间戳

---

## 使用示例

### 使用curl测试完整流程

```bash
# 1. 添加订阅
curl -X POST https://b-cast-mvp.your-subdomain.workers.dev/api/subscriptions/add \
  -H "Content-Type: application/json" \
  -d '{"url": "https://space.bilibili.com/3493085779869"}'

# 保存返回的订阅ID和RSS URL

# 2. 查看订阅列表
curl https://b-cast-mvp.your-subdomain.workers.dev/api/subscriptions/list

# 3. 获取RSS XML
curl https://b-cast-mvp.your-subdomain.workers.dev/api/subscriptions/rss/550e8400-....xml

# 4. 手动刷新订阅
curl -X POST https://b-cast-mvp.your-subdomain.workers.dev/api/subscriptions/refresh/550e8400-...

# 5. 禁用订阅
curl -X POST https://b-cast-mvp.your-subdomain.workers.dev/api/subscriptions/toggle/550e8400-...

# 6. 删除订阅
curl -X DELETE https://b-cast-mvp.your-subdomain.workers.dev/api/subscriptions/550e8400-...
```

---

## 错误处理

所有错误响应遵循统一格式：

```json
{
  "success": false,
  "error": "错误描述"
}
```

**常见错误码**:
- `400` - 参数错误（缺少URL、订阅已存在等）
- `404` - 资源不存在（订阅不存在、RSS文件不存在）
- `500` - 服务器错误（数据库错误、B站API错误等）

---

## 性能指标

- **订阅添加**: 5-10秒（取决于B站API响应和视频数量）
- **RSS获取**: < 100ms（有CDN缓存时）
- **列表查询**: < 50ms
- **定时任务**: 每个订阅约2-5秒，支持多个订阅并发处理

---

完整文档请参考:
- [RSS功能详细指南](./RSS-GUIDE.md)
- [快速开始](./RSS-QUICKSTART.md)
