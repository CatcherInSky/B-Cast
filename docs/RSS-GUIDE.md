# RSS订阅功能使用指南

B-Cast支持将B站播放列表转换为标准的RSS 2.0订阅源，可以在任何RSS阅读器中订阅。

## 功能特性

✅ **标准RSS 2.0格式**：兼容所有主流RSS阅读器  
✅ **自动更新检测**：每天定时检查新视频  
✅ **音频附件支持**：已下载的音频自动添加到RSS的enclosure  
✅ **R2存储**：RSS文件存储在Cloudflare R2，稳定可靠  
✅ **增量更新**：只下载新增视频，节省资源  

---

## API接口

### 1. 添加订阅

```bash
POST /api/subscriptions/add
```

**请求体：**
```json
{
  "url": "https://space.bilibili.com/3493085779869"
}
```

**响应：**
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "UP主的投稿",
    "rssUrl": "https://your-worker.workers.dev/api/subscriptions/rss/550e8400-e29b-41d4-a716-446655440000.xml",
    "itemCount": 25
  }
}
```

### 2. 获取订阅列表

```bash
GET /api/subscriptions/list
```

**响应：**
```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "UP主的投稿",
      "type": "uploader",
      "bilibili_url": "https://space.bilibili.com/3493085779869",
      "rss_url": "https://your-worker.workers.dev/api/subscriptions/rss/...",
      "uploader_name": "UP主名称",
      "enabled": 1,
      "item_count": 25,
      "downloaded_count": 10,
      "last_check_at": 1737705600000,
      "created_at": 1737619200000
    }
  ]
}
```

### 3. 获取订阅详情

```bash
GET /api/subscriptions/:id
```

### 4. 手动刷新订阅

```bash
POST /api/subscriptions/refresh/:id
```

强制刷新指定订阅，检查是否有新视频。

### 5. 删除订阅

```bash
DELETE /api/subscriptions/:id
```

删除订阅会同时删除R2中的RSS文件和数据库记录。

### 6. 切换订阅启用状态

```bash
POST /api/subscriptions/toggle/:id
```

禁用的订阅不会被定时任务检查。

### 7. 获取RSS XML

```bash
GET /api/subscriptions/rss/:filename
```

直接访问RSS XML文件，可以在RSS阅读器中订阅。

---

## RSS XML格式

生成的RSS遵循RSS 2.0标准：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>UP主的投稿</title>
    <link>https://your-worker.workers.dev</link>
    <description>UP主的bilibili空间</description>
    <language>zh-CN</language>
    <lastBuildDate>Sat, 24 Jan 2026 10:00:00 GMT</lastBuildDate>
    <generator>B-Cast RSS Generator</generator>
    
    <image>
      <url>https://i0.hdslb.com/xxx.jpg</url>
      <title>UP主的投稿</title>
      <link>https://your-worker.workers.dev</link>
    </image>
    
    <item>
      <title>视频标题</title>
      <link>https://www.bilibili.com/video/BV1xx4y1x7xx</link>
      <description>时长: 15分30秒</description>
      <pubDate>Fri, 23 Jan 2026 08:00:00 GMT</pubDate>
      <guid isPermaLink="false">BV1xx4y1x7xx</guid>
      <!-- 如果音频已下载，会添加enclosure -->
      <enclosure url="https://pub-xxxxx.r2.dev/audio/BV1xx4y1x7xx.m4a" 
                 length="12345678" 
                 type="audio/mp4" />
    </item>
  </channel>
</rss>
```

---

## 自动更新机制

### 定时任务

通过Cloudflare Workers的Cron Triggers实现自动更新：

**执行时间：** 每天凌晨2点（UTC时间）

**工作流程：**
1. 查询所有`enabled=1`的订阅
2. 依次重新解析每个订阅的B站URL
3. 对比数据库中已有的视频，找出新增视频
4. 将新视频添加到`subscription_items`和`download_queue`表
5. 重新生成RSS XML，包含最新的视频列表和已下载的音频URL
6. 更新RSS文件到R2
7. 更新订阅的`last_check_at`时间戳

**配置文件：** `backend/wrangler.toml`

```toml
[triggers]
crons = ["0 2 * * *"]
```

### 修改检查时间

编辑`wrangler.toml`中的cron表达式：

```toml
# 每6小时检查一次
crons = ["0 */6 * * *"]

# 每天早上8点和晚上8点检查
crons = ["0 8,20 * * *"]

# 每小时检查一次（不推荐，可能被B站限流）
crons = ["0 * * * *"]
```

---

## 数据库结构

### subscriptions表

```sql
CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  bilibili_url TEXT NOT NULL UNIQUE,
  rss_url TEXT NOT NULL,
  uploader_name TEXT,
  cover TEXT,
  description TEXT,
  last_check_at INTEGER,
  last_video_bvid TEXT,
  last_video_pubdate INTEGER,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### subscription_items表

```sql
CREATE TABLE subscription_items (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL,
  bvid TEXT NOT NULL,
  title TEXT NOT NULL,
  duration INTEGER,
  cover TEXT,
  pub_date INTEGER NOT NULL,
  download_queue_id TEXT,
  added_at INTEGER NOT NULL,
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
);
```

---

## 部署步骤

### 1. 创建数据库表

```bash
cd backend
wrangler d1 execute b-cast-mvp --file=../scripts/subscriptions.sql
```

### 2. 更新Worker URL

编辑`backend/wrangler.toml`，设置你的实际Worker URL：

```toml
[vars]
WORKER_URL = "b-cast-mvp.your-subdomain.workers.dev"
```

### 3. 部署到Cloudflare

```bash
cd backend
pnpm run deploy
```

### 4. 验证定时任务

```bash
# 查看定时任务配置
wrangler deployments list

# 手动触发定时任务测试
wrangler dev --test-scheduled
```

---

## 使用示例

### 在RSS阅读器中订阅

1. 添加订阅并获取RSS URL
2. 复制RSS URL到你的RSS阅读器（如Feedly、Inoreader等）
3. RSS阅读器会定期拉取更新

### 在Podcast客户端中订阅

由于RSS包含`<enclosure>`标签（音频附件），可以在支持播客的客户端中订阅：

- Apple Podcasts
- Pocket Casts
- Overcast
- Castro

**注意：** 只有已下载的视频才会在RSS中包含音频附件。

---

## 故障排查

### RSS无法更新

1. 检查订阅是否启用：`enabled = 1`
2. 查看Worker日志：`wrangler tail`
3. 手动刷新测试：`POST /api/subscriptions/refresh/:id`

### 定时任务未执行

1. 确认wrangler.toml中有cron配置
2. 检查Worker是否已部署：`wrangler deployments list`
3. 查看定时任务日志：`wrangler tail --format pretty`

### B站API限流

如果频繁请求B站API，可能被限流。建议：

- 减少定时任务频率
- 为B站请求添加Cookie（参考`docs/IMPLEMENT-COOKIE-SUPPORT.md`）
- 添加请求间隔延迟

---

## 性能优化

### RSS缓存

RSS endpoint已设置HTTP缓存：

```typescript
'Cache-Control': 'public, max-age=3600'  // 缓存1小时
```

### 批量处理

定时任务一次处理所有订阅，避免多次触发Worker。

### 增量更新

只解析和下载新增视频，不重复处理已有内容。

---

## 安全注意事项

⚠️ **公开访问**：RSS URL是公开的，任何知道URL的人都可以访问  
⚠️ **无认证**：当前MVP版本没有认证机制  
⚠️ **频率限制**：建议在Cloudflare上配置Rate Limiting  

---

## 下一步计划

- [ ] 支持自定义定时任务频率
- [ ] 添加RSS访问认证
- [ ] 支持OPML导入导出
- [ ] Webhook通知新视频
- [ ] RSS更新历史记录

---

如有问题，请查看项目文档或提交Issue。
