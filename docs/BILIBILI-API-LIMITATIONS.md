# B站API限制说明

## MVP版本支持的URL类型

### ✅ 完全支持

#### 1. 合集URL
```
https://space.bilibili.com/{uid}/channel/collectiondetail?sid={sid}
```
- ✅ 不需要WBI签名
- ✅ 不需要Cookie
- ✅ 稳定可靠

**示例：**
```
https://space.bilibili.com/245645656/channel/collectiondetail?sid=529166
```

#### 2. 单个视频URL
```
https://www.bilibili.com/video/BV{id}
```
- ✅ 不需要WBI签名
- ✅ 不需要Cookie
- ✅ 稳定可靠

**示例：**
```
https://www.bilibili.com/video/BV1xx411c7mu
```

---

### ❌ 暂不支持

#### UP主空间（全部投稿）
```
https://space.bilibili.com/{uid}
```

**为什么不支持？**

根据RSSHub的实现（[参考代码](https://github.com/DIYgod/RSSHub/blob/master/lib/routes/bilibili/video.ts)），获取UP主的全部投稿需要：

1. **Cookie** - B站账号Cookie
2. **WBI签名** - 动态签名验证
3. **DmVerify** - 弹幕防护信息
4. **RenderData** - 渲染数据

```typescript
// RSSHub的实现
const cookie = await cache.getCookie();
const params = utils.addWbiVerifyInfo(
    utils.addRenderData(
        utils.addDmVerifyInfoWithInter(...),
        renderData
    ),
    wbiVerifyString
);

const response = await got(`https://api.bilibili.com/x/space/wbi/arc/search?${params}`, {
    headers: {
        Cookie: cookie,  // ← 需要Cookie
        Referer: `https://space.bilibili.com/${uid}`,
        origin: `https://space.bilibili.com`,
    },
});
```

**MVP版本的设计原则：**
- 🎯 无需用户配置Cookie
- 🎯 保持简单易用
- 🎯 专注核心功能

---

## 解决方案

### 方案1：使用合集（推荐）

大多数UP主会将视频整理成合集，直接使用合集URL即可：

1. 访问UP主空间
2. 点击"合集和列表"
3. 选择想要的合集
4. 复制合集URL

### 方案2：单个视频

如果只想下载某个特定视频，直接使用视频URL。

### 方案3：等待未来版本

我们计划在未来版本中支持：
- [ ] Cookie配置（高级用户）
- [ ] 完整的WBI签名实现
- [ ] UP主全部投稿解析

---

## 技术细节

### RSSHub vs B-Cast MVP

| 功能 | RSSHub | B-Cast MVP | 原因 |
|------|--------|------------|------|
| 合集解析 | ✅ | ✅ | 无需Cookie |
| 单视频解析 | ✅ | ✅ | 无需Cookie |
| UP主空间（全部投稿） | ✅ | ❌ | 需要Cookie |
| WBI签名 | ✅ | ⚠️ 已实现但未启用 | 无Cookie时无效 |
| DmVerify | ✅ | ❌ | 超出MVP范围 |
| RenderData | ✅ | ❌ | 超出MVP范围 |

### API端点对比

#### 合集API（我们使用的）
```
GET https://api.bilibili.com/x/polymer/web-space/seasons_archives_list
参数：mid, season_id, sort_reverse, page_num, page_size
需要：Referer header
不需要：Cookie, WBI签名
```

#### UP主投稿API（RSSHub使用的）
```
GET https://api.bilibili.com/x/space/wbi/arc/search
参数：mid, ps, tid, pn, keyword, order, platform, web_location, order_avoided + WBI签名
需要：Cookie, Referer, Origin, WBI签名, DmVerify, RenderData
```

---

## FAQ

### Q: 为什么不实现完整的RSSHub功能？

**A:** MVP版本专注于核心功能：
- 简单易用，无需配置
- 满足大部分使用场景（合集和单视频）
- 快速验证产品价值

### Q: 会支持UP主空间解析吗？

**A:** 会的！但需要：
1. 用户提供Cookie（高级选项）
2. 或等待B站API政策变化

### Q: 我应该如何使用？

**A:** 最佳实践：
1. **追剧/系列内容** → 使用合集URL
2. **单个视频** → 使用视频URL
3. **UP主全部内容** → 暂不支持，请使用合集

---

## 参考资料

- [RSSHub Bilibili实现](https://github.com/DIYgod/RSSHub/tree/master/lib/routes/bilibili)
- [B站API文档](https://socialsisteryi.github.io/bilibili-API-collect/)
- [WBI签名说明](https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/misc/sign/wbi.md)
