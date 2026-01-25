# B-Cast MVP 功能说明

## ✅ 支持的URL类型

### 1. UP主空间（全部投稿）

```
https://space.bilibili.com/{uid}
```

**特点：**
- ✅ 使用WBI签名验证
- ✅ 无需Cookie（游客模式）
- ✅ 获取最新30个投稿
- ✅ 自动fallback到简化方案

**示例：**
```
https://space.bilibili.com/546195
https://space.bilibili.com/2267573
```

**技术实现：**
- API: `/x/space/wbi/arc/search`
- 方法: WBI签名 + 完整headers
- Fallback: 旧版API（如果WBI失败）

---

### 2. UP主合集

```
https://space.bilibili.com/{uid}/channel/collectiondetail?sid={sid}
```

**特点：**
- ✅ 无需WBI签名
- ✅ 无需Cookie
- ✅ 稳定可靠
- ✅ 支持分页

**示例：**
```
https://space.bilibili.com/245645656/channel/collectiondetail?sid=529166
```

**技术实现：**
- API: `/x/polymer/web-space/seasons_archives_list`
- 方法: 简单GET请求
- Headers: 仅需Referer

---

### 3. 单个视频

```
https://www.bilibili.com/video/BV{id}
```

**特点：**
- ✅ 无需WBI签名
- ✅ 无需Cookie
- ✅ 即时解析

**示例：**
```
https://www.bilibili.com/video/BV1xx411c7mu
```

**技术实现：**
- API: `/x/web-interface/view`
- 方法: 简单GET请求
- Headers: 标准浏览器headers

---

## 🔧 技术架构

### WBI签名实现

参考：
- [RSSHub Bilibili Utils](https://github.com/DIYgod/RSSHub/blob/master/lib/routes/bilibili/utils.ts)
- [RSSWorker](https://github.com/yllhwa/RSSWorker)
- 知乎文章：https://zhuanlan.zhihu.com/p/1961014749807513938

**核心步骤：**

1. **获取WBI Keys**
   ```typescript
   GET https://api.bilibili.com/x/web-interface/nav
   // 游客模式也能获取wbi_img
   ```

2. **混淆密钥**
   ```typescript
   const mixinKey = getMixinKey(imgKey + subKey);
   // 使用固定的混淆表
   ```

3. **生成签名**
   ```typescript
   const wbiSign = md5(sortedParams + mixinKey);
   // 使用Web Crypto API计算MD5
   ```

4. **添加到请求**
   ```typescript
   URL?params&wts=timestamp&w_rid=signature
   ```

### Fallback机制

```
┌─────────────────┐
│  尝试WBI方案    │
│  (UP主空间)     │
└────────┬────────┘
         │
    成功? │  失败
         ↓
    ┌────┴────┐
    │  是      │  否
    ↓         ↓
┌────────┐  ┌──────────────┐
│ 返回结果│  │ 简化方案     │
└────────┘  │ (旧版API)    │
            └──────┬───────┘
                   │
              成功? │  失败
                   ↓
              ┌────┴────┐
              │  是      │  否
              ↓         ↓
          ┌────────┐  ┌────────┐
          │ 返回结果│  │ 错误提示│
          └────────┘  └────────┘
```

---

## 📊 性能和限制

### API请求频率

| API类型 | 频率限制 | 缓存策略 |
|---------|---------|---------|
| WBI Keys | 无限制 | 10分钟缓存 |
| UP主信息 | 无限制 | 前端缓存 |
| 视频列表 | 无限制 | 前端缓存 |
| 合集列表 | 无限制 | 前端缓存 |

### 数据限制

- **UP主投稿**: 最新30个视频
- **合集**: 支持分页，单次100个
- **单视频**: 完整信息

---

## 🧪 测试用例

### UP主空间测试

**UP主: 老番茄**
```bash
curl -X POST http://localhost:8787/api/bilibili/parse \
  -H "Content-Type: application/json" \
  -d '{"url": "https://space.bilibili.com/2267573"}'
```

**预期响应：**
```json
{
  "success": true,
  "method": "wbi",
  "data": {
    "playlist": {
      "name": "老番茄的投稿",
      "type": "uploader",
      "uploaderName": "老番茄",
      ...
    },
    "items": [...]
  }
}
```

### 合集测试

```bash
curl -X POST http://localhost:8787/api/bilibili/parse \
  -H "Content-Type: application/json" \
  -d '{"url": "https://space.bilibili.com/245645656/channel/collectiondetail?sid=529166"}'
```

**预期响应：**
```json
{
  "success": true,
  "method": "simplified",
  "data": {
    "playlist": {
      "name": "合集名称",
      "type": "collection",
      ...
    },
    "items": [...]
  }
}
```

### 单视频测试

```bash
curl -X POST http://localhost:8787/api/bilibili/parse \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.bilibili.com/video/BV1xx411c7mu"}'
```

---

## 🚀 部署清单

### 本地开发

```bash
cd backend
pnpm install
pnpm dev
```

访问：http://localhost:8787

### 生产部署

```bash
cd backend
wrangler deploy
```

**环境变量（可选）：**
- `BILIBILI_COOKIE` - 如果需要更高的成功率（未来功能）

---

## 📈 与最初设计的对比

| 功能 | 最初设计 | 当前MVP | 状态 |
|------|---------|---------|------|
| 合集解析 | ✅ | ✅ | 完成 |
| 单视频 | ✅ | ✅ | 完成 |
| UP主空间 | ❌ 计划v1.1 | ✅ | **提前完成** |
| WBI签名 | ⚠️ 预留 | ✅ | **已实现** |
| Cookie支持 | ❌ | ⚠️ 可选 | 未来功能 |
| 下载队列 | ✅ | ✅ | 完成 |
| R2存储 | ✅ | ✅ | 完成 |

**结论：** MVP版本超出预期，已支持所有核心功能！

---

## ⚠️ 已知限制

### 1. UP主投稿数量
- 当前：最新30个
- 原因：API限制
- 未来：支持分页获取更多

### 2. 游客模式限制
- WBI Keys可以获取
- 部分UP主可能受限
- 解决方案：添加Cookie支持

### 3. API稳定性
- B站API可能变化
- WBI算法可能更新
- Fallback机制保证可用性

---

## 🔮 未来计划

### Version 1.1
- [ ] 支持分页（获取更多视频）
- [ ] Cookie配置（可选）
- [ ] 更多错误处理

### Version 1.2
- [ ] 实时订阅更新
- [ ] 自动定期检查新视频
- [ ] WebSocket推送

### Version 2.0
- [ ] 支持其他平台（YouTube, Podcast等）
- [ ] 高级过滤和搜索
- [ ] AI推荐

---

## 📚 参考资料

- [RSSHub源码](https://github.com/DIYgod/RSSHub)
- [RSSWorker](https://github.com/yllhwa/RSSWorker)
- [B站API文档](https://socialsisteryi.github.io/bilibili-API-collect/)
- [WBI签名说明](https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/misc/sign/wbi.md)
- [Web Crypto API](https://developer.mozilla.org/zh-CN/docs/Web/API/Web_Crypto_API)

---

**更新日期：** 2026-01-23  
**版本：** 1.0-MVP  
**状态：** ✅ 生产就绪 + UP主空间支持
