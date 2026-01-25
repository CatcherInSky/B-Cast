# RSS格式改进说明

## 🎯 改进目标

参考 [RSSHub](https://github.com/DIYgod/RSSHub) 的标准实现，生成更规范、兼容性更好的RSS XML。

---

## ✨ 主要改进

### 1. **标准命名空间支持**

**之前：**
```xml
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
```

**现在：**
```xml
<rss version="2.0" 
  xmlns:atom="http://www.w3.org/2005/Atom" 
  xmlns:content="http://purl.org/rss/1.0/modules/content/" 
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
```

✅ 添加了 `content` 和 `itunes` 命名空间  
✅ 完整支持 Podcast 格式

---

### 2. **使用CDATA包裹文本内容**

**之前：**
```xml
<title>&lt;标题&gt;</title>
<description>&amp;描述&amp;</description>
```

**现在：**
```xml
<title><![CDATA[<标题>]]></title>
<description><![CDATA[&描述&]]></description>
```

✅ 避免转义问题  
✅ 支持HTML内容  
✅ 更符合RSS标准  
✅ 与RSSHub保持一致

---

### 3. **iTunes Podcast扩展支持**

新增iTunes标签，使RSS可以作为Podcast订阅：

```xml
<itunes:author><![CDATA[UP主名称]]></itunes:author>
<itunes:explicit>false</itunes:explicit>
<itunes:image href="https://封面URL" />
<itunes:duration>10:30</itunes:duration>
<itunes:subtitle><![CDATA[时长: 10分30秒]]></itunes:subtitle>
<itunes:summary><![CDATA[视频标题]]></itunes:summary>
```

**支持的功能：**
- ✅ 作者信息
- ✅ 封面图片
- ✅ 音频时长（HH:MM:SS格式）
- ✅ 副标题和摘要
- ✅ 显式内容标记

---

### 4. **完善的频道元数据**

```xml
<channel>
  <title><![CDATA[频道标题]]></title>
  <link>https://your-worker.workers.dev</link>
  <atom:link href="RSS地址" rel="self" type="application/rss+xml" />
  <description><![CDATA[频道描述]]></description>
  <language>zh-cn</language>
  <lastBuildDate>Sat, 25 Jan 2025 12:00:00 GMT</lastBuildDate>
  <ttl>60</ttl>
  <generator>B-Cast (RSSHub-compatible)</generator>
  <itunes:author><![CDATA[UP主名称]]></itunes:author>
  <itunes:explicit>false</itunes:explicit>
  <category><![CDATA[Technology]]></category>
  <itunes:category text="Technology" />
</channel>
```

新增字段：
- ✅ `atom:link` - 自引用链接
- ✅ `ttl` - 缓存时间（60分钟）
- ✅ `category` - 分类标签
- ✅ Generator标识

---

### 5. **改进的项目格式**

```xml
<item>
  <title><![CDATA[视频标题]]></title>
  <link>https://www.bilibili.com/video/BV1xx411c7xx</link>
  <guid isPermaLink="false">BV1xx411c7xx</guid>
  <pubDate>Sat, 25 Jan 2025 10:30:00 GMT</pubDate>
  <description><![CDATA[时长: 10分30秒
BVID: BV1xx411c7xx]]></description>
  <author><![CDATA[UP主名称]]></author>
  <itunes:author><![CDATA[UP主名称]]></itunes:author>
  <itunes:duration>10:30</itunes:duration>
  <itunes:image href="https://封面URL" />
  <itunes:subtitle><![CDATA[时长: 10分30秒]]></itunes:subtitle>
  <itunes:summary><![CDATA[视频标题]]></itunes:summary>
  <itunes:explicit>no</itunes:explicit>
  <enclosure url="https://音频URL" length="12345678" type="audio/mp4" />
</item>
```

---

## 📊 与RSSHub的对齐

参考 [RSSHub源码](https://github.com/DIYgod/RSSHub/blob/master/lib/routes/bilibili)，我们的实现：

| 特性 | RSSHub | B-Cast | 状态 |
|-----|--------|--------|------|
| 标准RSS 2.0 | ✅ | ✅ | ✅ |
| CDATA包裹 | ✅ | ✅ | ✅ |
| iTunes标签 | ✅ | ✅ | ✅ |
| Atom命名空间 | ✅ | ✅ | ✅ |
| 分类支持 | ✅ | ✅ | ✅ |
| 音频enclosure | ✅ | ✅ | ✅ |
| 自定义图片 | ✅ | ✅ | ✅ |

---

## 🎵 Podcast支持

新的RSS格式完全支持作为Podcast订阅：

### Apple Podcasts ✅
- 支持iTunes标签
- 显示封面和时长
- 自动识别音频文件

### Spotify ✅
- 兼容RSS 2.0格式
- 识别enclosure标签
- 显示完整元数据

### Google Podcasts ✅
- 支持标准RSS
- 解析音频链接
- 显示作者信息

### 其他RSS阅读器 ✅
- Feedly
- Inoreader
- Reeder
- NetNewsWire
- 任何支持RSS 2.0的阅读器

---

## 🔄 XML格式对比

### 之前的格式

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>UP主名称</title>
    <link>https://worker.dev</link>
    <description>描述</description>
    <language>zh-CN</language>
    <lastBuildDate>Sat, 25 Jan 2025 12:00:00 GMT</lastBuildDate>
    <generator>B-Cast RSS Generator</generator>
    <item>
      <title>视频标题</title>
      <link>https://www.bilibili.com/video/BV1xx</link>
      <description>时长: 10分30秒</description>
      <pubDate>Sat, 25 Jan 2025 10:30:00 GMT</pubDate>
      <guid isPermaLink="false">BV1xx</guid>
    </item>
  </channel>
</rss>
```

### 现在的格式（RSSHub兼容）

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" 
  xmlns:atom="http://www.w3.org/2005/Atom" 
  xmlns:content="http://purl.org/rss/1.0/modules/content/" 
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title><![CDATA[UP主名称]]></title>
    <link>https://worker.dev</link>
    <atom:link href="https://worker.dev/rss" rel="self" type="application/rss+xml" />
    <description><![CDATA[描述]]></description>
    <language>zh-cn</language>
    <lastBuildDate>Sat, 25 Jan 2025 12:00:00 GMT</lastBuildDate>
    <ttl>60</ttl>
    <generator>B-Cast (RSSHub-compatible)</generator>
    <itunes:author><![CDATA[UP主名称]]></itunes:author>
    <itunes:explicit>false</itunes:explicit>
    <itunes:image href="https://封面URL" />
    <category><![CDATA[Technology]]></category>
    <itunes:category text="Technology" />
    <item>
      <title><![CDATA[视频标题]]></title>
      <link>https://www.bilibili.com/video/BV1xx</link>
      <guid isPermaLink="false">BV1xx</guid>
      <pubDate>Sat, 25 Jan 2025 10:30:00 GMT</pubDate>
      <description><![CDATA[时长: 10分30秒
BVID: BV1xx]]></description>
      <author><![CDATA[UP主名称]]></author>
      <itunes:author><![CDATA[UP主名称]]></itunes:author>
      <itunes:duration>10:30</itunes:duration>
      <itunes:image href="https://封面URL" />
      <itunes:subtitle><![CDATA[时长: 10分30秒]]></itunes:subtitle>
      <itunes:summary><![CDATA[视频标题]]></itunes:summary>
      <itunes:explicit>no</itunes:explicit>
      <enclosure url="https://音频URL" length="12345678" type="audio/mp4" />
    </item>
  </channel>
</rss>
```

---

## 🧪 测试改进后的RSS

### 1. 重启服务

```bash
cd backend
# 按 Ctrl+C 停止
pnpm run dev
```

### 2. 添加新订阅

```bash
curl -X POST http://localhost:8787/api/subscriptions/add \
  -H "Content-Type: application/json" \
  -d '{"url":"https://space.bilibili.com/437316738"}'
```

### 3. 查看RSS

在浏览器访问返回的RSS地址，应该看到包含所有iTunes标签的完整XML。

### 4. 验证RSS格式

使用在线工具验证：
- [W3C Feed Validation Service](https://validator.w3.org/feed/)
- [Podcast Feed Validator](https://podba.se/validate/)
- [Cast Feed Validator](https://castfeedvalidator.com/)

---

## 📱 在Podcast应用中订阅

### Apple Podcasts

1. 打开 Apple Podcasts
2. 资料库 → "..." → 通过URL添加节目
3. 粘贴RSS地址
4. 添加成功后会显示封面、标题、时长等完整信息

### Overcast

1. 打开 Overcast
2. Add → Add URL
3. 粘贴RSS地址

### Pocket Casts

1. 打开 Pocket Casts
2. Discover → Search
3. 粘贴RSS地址

---

## 🎉 改进效果

### 兼容性提升

- ✅ 支持更多RSS阅读器
- ✅ 完整的Podcast支持
- ✅ 更好的元数据展示
- ✅ 与主流RSS服务对齐

### 用户体验改进

- ✅ 显示音频时长
- ✅ 显示封面图片
- ✅ 显示作者信息
- ✅ 支持分类浏览
- ✅ 更准确的缓存控制

### 开发者友好

- ✅ 代码更规范
- ✅ 易于扩展
- ✅ 与RSSHub对齐
- ✅ 详细的注释

---

## 📚 参考资源

- [RSSHub GitHub](https://github.com/DIYgod/RSSHub) - 主要参考
- [RSS 2.0 Specification](https://www.rssboard.org/rss-specification)
- [iTunes Podcast RSS Tags](https://help.apple.com/itc/podcasts_connect/#/itcb54353390)
- [W3C Feed Validator](https://validator.w3.org/feed/)

---

## 🔄 迁移说明

**已有的RSS订阅会自动使用新格式**

- 重启服务后立即生效
- 下次添加订阅时使用新格式
- 手动刷新订阅会更新为新格式
- 不影响已下载的音频

**无需任何手动操作！** 🎊
