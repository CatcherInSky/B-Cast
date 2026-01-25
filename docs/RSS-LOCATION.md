# RSS地址获取指南

## 🎯 快速答案

添加B站播放列表后，RSS地址会在以下位置显示：

### 1️⃣ 前端界面（推荐）

添加播放列表后，在播放列表卡片中会显示RSS地址，点击"复制"按钮即可复制。

```
┌─────────────────────────────────────────────────┐
│ 📺 UP主名称                        [展开] [删除] │
│ @UP主名称                                       │
│ 10 个项目                                       │
│                                                 │
│ RSS: http://localhost:8787/api/...  [复制]     │
└─────────────────────────────────────────────────┘
```

### 2️⃣ API响应

调用添加订阅API时，响应中包含RSS地址：

```bash
curl -X POST http://localhost:8787/api/subscriptions/add \
  -H "Content-Type: application/json" \
  -d '{"url":"https://space.bilibili.com/437316738"}'
```

响应：
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "UP主名称",
    "rssUrl": "http://localhost:8787/api/subscriptions/rss/550e8400-e29b-41d4-a716-446655440000.xml",
    "itemCount": 10
  }
}
```

### 3️⃣ 查询订阅列表

```bash
curl http://localhost:8787/api/subscriptions/list
```

响应中每个订阅都有 `rss_url` 字段。

---

## 📋 RSS地址格式

```
<Worker地址>/api/subscriptions/rss/<订阅ID>.xml
```

### 本地开发环境

```
http://localhost:8787/api/subscriptions/rss/550e8400-e29b-41d4-a716-446655440000.xml
```

### 生产环境

```
https://b-cast-mvp.your-subdomain.workers.dev/api/subscriptions/rss/550e8400-e29b-41d4-a716-446655440000.xml
```

---

## 🔍 如何查看RSS内容

### 方法1: 浏览器直接访问

复制RSS地址，粘贴到浏览器地址栏，回车即可查看XML内容。

### 方法2: 使用curl

```bash
curl http://localhost:8787/api/subscriptions/rss/550e8400-e29b-41d4-a716-446655440000.xml
```

### 方法3: RSS阅读器预览

大多数RSS阅读器在添加订阅前会预览内容。

---

## 📱 在RSS阅读器中使用

### Feedly
1. 打开 [Feedly](https://feedly.com)
2. 点击 "Add Content"
3. 粘贴RSS地址
4. 点击 "Follow"

### Inoreader
1. 打开 [Inoreader](https://www.inoreader.com)
2. 点击 "+" → "Add feed"
3. 粘贴RSS地址
4. 点击 "Subscribe"

### Apple Podcasts
1. 打开 Apple Podcasts App
2. 资料库 → 右上角 "..."
3. 选择 "通过URL添加节目"
4. 粘贴RSS地址

### Reeder (iOS/macOS)
1. 打开 Reeder
2. 点击 "+" → "Add Feed"
3. 粘贴RSS地址
4. 点击 "Add"

---

## 🎨 RSS内容示例

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>UP主名称</title>
    <link>https://space.bilibili.com/437316738</link>
    <description>UP主的简介</description>
    <language>zh-cn</language>
    <itunes:author>UP主名称</itunes:author>
    <itunes:image href="https://封面图片URL"/>
    
    <item>
      <title>【视频标题】</title>
      <link>https://www.bilibili.com/video/BV1xx411c7xx</link>
      <guid>BV1xx411c7xx</guid>
      <pubDate>Wed, 24 Jan 2024 10:30:00 +0800</pubDate>
      <description>视频简介...</description>
      <itunes:duration>300</itunes:duration>
      <enclosure 
        url="https://your-worker.workers.dev/audio/BV1xx411c7xx.m4a" 
        type="audio/mp4" 
        length="12345678"/>
    </item>
    
    <!-- 更多视频... -->
  </channel>
</rss>
```

---

## 🔄 RSS更新机制

### 自动更新（生产环境）

- **Cron定时任务**：每天UTC时间2:00自动检查更新
- 检查所有启用的订阅
- 发现新视频后自动更新RSS

### 手动更新

```bash
# 方法1: 触发订阅更新检查
curl -X POST http://localhost:8787/api/cron/check-updates

# 方法2: 刷新特定订阅
curl -X POST http://localhost:8787/api/subscriptions/refresh/550e8400-e29b-41d4-a716-446655440000
```

---

## ⚡ 特性说明

### ✅ RSS包含的信息

- 视频标题、封面、简介
- 发布时间、时长
- B站原始链接
- **音频下载链接**（下载完成后自动添加）

### 🎵 音频播放

RSS中的 `<enclosure>` 标签包含音频URL：
- 下载完成前：不包含音频URL
- 下载完成后：自动添加音频URL到RSS
- RSS阅读器可以直接播放音频

### 🔄 动态更新

- 添加新视频时，RSS自动更新
- 音频下载完成后，RSS自动更新音频链接
- RSS阅读器会自动获取更新

---

## 🐛 常见问题

### Q: RSS地址找不到了怎么办？

**A:** 调用API查询：
```bash
curl http://localhost:8787/api/subscriptions/list | jq '.data[] | {name, rss_url}'
```

### Q: RSS无法访问？

**A:** 检查：
1. Worker是否正在运行（`pnpm run dev`）
2. 订阅ID是否正确
3. 网络连接是否正常

### Q: RSS内容为空？

**A:** 可能原因：
1. B站URL解析失败
2. 订阅没有视频
3. R2存储未正确保存RSS文件

查看后端日志排查问题。

### Q: RSS中没有音频链接？

**A:** 这是正常的：
1. 新添加的视频需要先下载
2. 运行下载脚本或GitHub Action
3. 下载完成后RSS会自动更新

---

## 📚 相关文档

- [本地测试指南](./LOCAL-TESTING.md)
- [数据链路与测试](./DATA-FLOW-TESTING.md)
- [API文档](./API.md)
