# RSS格式说明

## ❓ 你的三个问题

### 1. ❌ localhost地址问题 - 已修复

**问题：**
```xml
<link>http://localhost:8787</link>
<atom:link href="http://localhost:8787" rel="self" type="application/rss+xml" />
```

**原因：** 
- 本地开发时，baseUrl自动使用请求的origin
- 导致生成的RSS包含localhost地址

**✅ 已修复：**
- 优先使用 `wrangler.toml` 中配置的 `WORKER_URL`
- 本地开发时会使用localhost（正常）
- **生产环境部署时，请在 `wrangler.toml` 中配置正确的URL**

**配置方法：**
```toml
# backend/wrangler.toml
[vars]
WORKER_URL = "b-cast-mvp.your-subdomain.workers.dev"
```

部署后会生成：
```xml
<link>https://b-cast-mvp.your-subdomain.workers.dev</link>
```

---

### 2. ✅ CDATA是正确的！

**不是问题！** 这是RSS标准做法。

```xml
<title><![CDATA[视频标题]]></title>
<description><![CDATA[内容描述]]></description>
```

**为什么使用CDATA？**
- ✅ **RSS 2.0标准推荐** - 符合规范
- ✅ **RSSHub也使用** - 业界标准做法
- ✅ **避免转义问题** - 不需要把 `<` 转成 `&lt;`
- ✅ **支持特殊字符** - 可以包含 `&`, `<`, `>` 等
- ✅ **支持HTML内容** - 描述中可以包含HTML标签
- ✅ **更好的兼容性** - 所有RSS阅读器都支持

**对比：**

不使用CDATA（老式方法）：
```xml
<title>这是标题 &lt;带标签&gt;</title>
<description>描述 &amp; 更多内容</description>
```

使用CDATA（现代标准）：
```xml
<title><![CDATA[这是标题 <带标签>]]></title>
<description><![CDATA[描述 & 更多内容]]></description>
```

**参考：**
- [RSS 2.0 Specification](https://www.rssboard.org/rss-specification)
- [RSSHub源码](https://github.com/DIYgod/RSSHub) - 所有RSS都使用CDATA

---

### 3. ✅ iTunes标签是正确的！

**不是问题！** 这让RSS可以作为Podcast订阅。

```xml
<itunes:author><![CDATA[UP主名称]]></itunes:author>
<itunes:duration>10:30</itunes:duration>
<itunes:image href="https://封面URL" />
<itunes:explicit>no</itunes:explicit>
```

**为什么使用iTunes标签？**
- ✅ **支持Podcast平台** - Apple Podcasts, Spotify等
- ✅ **RSSHub也使用** - 标准做法
- ✅ **显示丰富元数据** - 封面、时长、作者等
- ✅ **向后兼容** - 普通RSS阅读器会忽略不认识的标签
- ✅ **提升用户体验** - 更好的展示效果

**支持的平台：**
- ✅ Apple Podcasts
- ✅ Spotify
- ✅ Google Podcasts
- ✅ Overcast
- ✅ Pocket Casts
- ✅ 所有RSS阅读器（会忽略iTunes标签）

**参考：**
- [iTunes Podcast RSS Specification](https://help.apple.com/itc/podcasts_connect/#/itcb54353390)
- [RSSHub的Podcast支持](https://github.com/DIYgod/RSSHub)

---

## 🎯 总结

| 问题 | 是否问题 | 状态 | 说明 |
|-----|---------|------|------|
| 1. localhost地址 | ❌ 是问题 | ✅ 已修复 | 配置WORKER_URL即可 |
| 2. CDATA标签 | ✅ 不是问题 | ✅ 标准做法 | RSS标准推荐 |
| 3. iTunes标签 | ✅ 不是问题 | ✅ 增强功能 | 支持Podcast |

---

## 🔧 如何配置正确的URL

### 本地开发（自动处理）

本地开发时，会自动使用 `http://localhost:8787`：

```xml
<link>http://localhost:8787</link>
```

这是正常的，因为你在本地测试。

### 生产环境（需要配置）

部署到Cloudflare Workers后：

**步骤1: 获取Worker URL**

部署后会显示：
```bash
pnpm run deploy
# 输出：
# Published b-cast-mvp
#   https://b-cast-mvp.abc123.workers.dev
```

**步骤2: 更新wrangler.toml**

```toml
# backend/wrangler.toml
[vars]
WORKER_URL = "b-cast-mvp.abc123.workers.dev"  # 不需要https://前缀
```

**步骤3: 重新部署**

```bash
pnpm run deploy
```

现在RSS会使用正确的URL：
```xml
<link>https://b-cast-mvp.abc123.workers.dev</link>
```

---

## 📱 RSS示例（完整格式）

这是标准的、符合规范的RSS格式：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" 
  xmlns:atom="http://www.w3.org/2005/Atom" 
  xmlns:content="http://purl.org/rss/1.0/modules/content/" 
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title><![CDATA[UP主名称]]></title>
    <link>https://your-worker.workers.dev</link>
    <atom:link href="https://your-worker.workers.dev/rss/xxx.xml" 
               rel="self" type="application/rss+xml" />
    <description><![CDATA[UP主的B站内容订阅]]></description>
    <language>zh-cn</language>
    <lastBuildDate>Sun, 25 Jan 2026 12:00:00 GMT</lastBuildDate>
    <ttl>60</ttl>
    <generator>B-Cast (RSSHub-compatible)</generator>
    
    <!-- iTunes Podcast扩展 -->
    <itunes:author><![CDATA[UP主名称]]></itunes:author>
    <itunes:explicit>false</itunes:explicit>
    <itunes:image href="https://封面URL" />
    
    <!-- 分类 -->
    <category><![CDATA[Technology]]></category>
    <itunes:category text="Technology" />
    
    <!-- 项目 -->
    <item>
      <title><![CDATA[视频标题]]></title>
      <link>https://www.bilibili.com/video/BV1xx</link>
      <guid isPermaLink="false">BV1xx</guid>
      <pubDate>Sun, 25 Jan 2026 10:30:00 GMT</pubDate>
      <description><![CDATA[时长: 10分30秒
BVID: BV1xx]]></description>
      <author><![CDATA[UP主名称]]></author>
      
      <!-- iTunes项目扩展 -->
      <itunes:author><![CDATA[UP主名称]]></itunes:author>
      <itunes:duration>10:30</itunes:duration>
      <itunes:image href="https://封面URL" />
      <itunes:subtitle><![CDATA[时长: 10分30秒]]></itunes:subtitle>
      <itunes:summary><![CDATA[视频标题]]></itunes:summary>
      <itunes:explicit>no</itunes:explicit>
      
      <!-- 音频附件 -->
      <enclosure url="https://音频URL" length="12345678" type="audio/mp4" />
    </item>
  </channel>
</rss>
```

---

## ✅ 验证RSS格式

### 在线验证工具

1. **W3C Feed Validator**
   - https://validator.w3.org/feed/
   - 粘贴你的RSS URL
   - 会验证格式是否符合标准

2. **Podcast Feed Validator**
   - https://podba.se/validate/
   - 验证iTunes标签是否正确

3. **Cast Feed Validator**
   - https://castfeedvalidator.com/
   - 专业的Podcast验证工具

### 本地验证

```bash
# 下载RSS
curl http://localhost:8787/api/subscriptions/rss/xxx.xml > test.xml

# 检查格式
xmllint --format test.xml

# 或使用Python
python3 -c "import xml.etree.ElementTree as ET; ET.parse('test.xml')"
```

---

## 🎉 你的RSS是标准的、正确的！

只需要在生产环境配置正确的 `WORKER_URL`，其他都是符合标准的做法。

**CDATA和iTunes标签不是问题，而是特性！** ✨
