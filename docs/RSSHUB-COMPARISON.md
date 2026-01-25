# B-Cast vs RSSHub：技术对比

## 概述

本文档对比B-Cast MVP实现与RSSHub的Bilibili解析实现，说明技术选择的原因。

---

## RSSHub的完整实现

### 核心组件

#### 1. Cookie管理
```typescript
const cookie = await cache.getCookie();
```
- 从配置或缓存获取B站Cookie
- 用于突破API访问限制
- 需要用户提供有效的登录Cookie

#### 2. WBI签名验证
```typescript
const wbiVerifyString = await cache.getWbiVerifyString();
const params = utils.addWbiVerifyInfo(baseParams, wbiVerifyString);
```
- 动态获取WBI密钥
- 对请求参数进行签名
- 防止未授权访问

#### 3. 弹幕防护（DmVerify）
```typescript
const dmImgList = utils.getDmImgList();
const dmImgInter = utils.getDmImgInter();
const params = utils.addDmVerifyInfoWithInter(baseParams, dmImgList, dmImgInter);
```
- 防止弹幕系统的反爬虫
- 需要额外的验证信息

#### 4. 渲染数据（RenderData）
```typescript
const renderData = await cache.getRenderData(uid);
const params = utils.addRenderData(baseParams, renderData);
```
- 页面渲染所需的额外数据
- 进一步验证请求合法性

### 完整的请求流程

```typescript
// 1. 获取所有验证信息
const cookie = await cache.getCookie();
const wbiVerifyString = await cache.getWbiVerifyString();
const dmImgList = utils.getDmImgList();
const dmImgInter = utils.getDmImgInter();
const renderData = await cache.getRenderData(uid);

// 2. 构建多层验证参数
const params = utils.addWbiVerifyInfo(
    utils.addRenderData(
        utils.addDmVerifyInfoWithInter(
            `mid=${uid}&ps=30&tid=0&pn=1&keyword=&order=pubdate&platform=web&web_location=1550101&order_avoided=true`,
            dmImgList,
            dmImgInter
        ),
        renderData
    ),
    wbiVerifyString
);

// 3. 发送请求
const response = await got(`https://api.bilibili.com/x/space/wbi/arc/search?${params}`, {
    headers: {
        Referer: `https://space.bilibili.com/${uid}`,
        origin: `https://space.bilibili.com`,
        Cookie: cookie,  // 关键！
    },
});
```

---

## B-Cast MVP的简化实现

### 设计原则

1. **无需用户配置** - 开箱即用
2. **专注核心场景** - 合集和单视频
3. **稳定可靠** - 避免依赖易变的Cookie

### 技术选择

#### 支持的API

##### 1. 合集API
```typescript
// 端点
GET https://api.bilibili.com/x/polymer/web-space/seasons_archives_list

// 参数
?mid={uid}&season_id={sid}&sort_reverse=false&page_num=1&page_size=100

// Headers
{
  'Referer': link,
  'User-Agent': '...',
  'Accept': 'application/json, text/plain, */*',
  // ... 其他标准headers
}

// 不需要：Cookie, WBI签名, DmVerify, RenderData
```

**优点：**
- ✅ 无需Cookie
- ✅ 无需复杂验证
- ✅ API稳定
- ✅ 满足系列内容需求

##### 2. 单视频API
```typescript
// 端点
GET https://api.bilibili.com/x/web-interface/view

// 参数
?bvid={bvid}

// Headers
{
  'Referer': 'https://www.bilibili.com',
  'User-Agent': '...',
  // ... 标准headers
}

// 不需要：Cookie, WBI签名
```

**优点：**
- ✅ 无需Cookie
- ✅ 简单直接
- ✅ API稳定

#### 不支持的功能

##### UP主空间（全部投稿）

**原因：**
- ❌ 必须使用 `/x/space/wbi/arc/search` API
- ❌ 该API强制要求Cookie
- ❌ 需要WBI签名 + DmVerify + RenderData
- ❌ 复杂度超出MVP范围

---

## 功能对比表

| 功能 | RSSHub | B-Cast MVP | 技术原因 |
|------|--------|------------|---------|
| **合集解析** | ✅ | ✅ | 使用公开API，无需Cookie |
| **单视频解析** | ✅ | ✅ | 使用公开API，无需Cookie |
| **UP主全部投稿** | ✅ | ❌ | 需要Cookie + WBI + DmVerify + RenderData |
| **Cookie支持** | ✅ | ❌ | MVP不要求用户配置 |
| **WBI签名** | ✅ | ⚠️ 已实现未启用 | 无Cookie时作用有限 |
| **DmVerify** | ✅ | ❌ | 超出MVP范围 |
| **RenderData** | ✅ | ❌ | 超出MVP范围 |
| **缓存机制** | ✅ | ✅ | 都有实现 |

---

## 实现复杂度对比

### RSSHub（完整方案）

**代码文件：**
- `utils.ts` - 核心工具函数（WBI, DmVerify, RenderData）
- `cache.ts` - 缓存管理（Cookie, WBI keys, UserInfo等）
- `video.ts` - UP主视频解析
- `user-collection.ts` - 合集解析
- ... 更多

**复杂度：**
- 🔴 高 - 多层验证机制
- 🔴 依赖Cookie管理
- 🔴 需要定期更新验证逻辑

### B-Cast MVP（简化方案）

**代码文件：**
- `bilibili.ts` - 核心解析逻辑
- `bilibili-wbi.ts` - WBI签名（预留）
- `bilibili-wbi-enhanced.ts` - WBI增强版（预留）

**复杂度：**
- 🟢 低 - 直接调用公开API
- 🟢 无需Cookie管理
- 🟢 代码简洁易维护

---

## 用户体验对比

### RSSHub

**优点：**
- ✅ 功能完整
- ✅ 支持所有场景

**缺点：**
- ⚠️ 需要配置Cookie（高级用户）
- ⚠️ Cookie可能过期，需要更新
- ⚠️ 配置复杂度高

### B-Cast MVP

**优点：**
- ✅ 开箱即用
- ✅ 无需任何配置
- ✅ 简单直观

**缺点：**
- ⚠️ 不支持UP主全部投稿
- ⚠️ 需要用户手动找到合集URL

---

## 未来计划

### Phase 1: MVP（当前）
- ✅ 合集解析
- ✅ 单视频解析
- ✅ 简单的错误提示

### Phase 2: Cookie支持（可选）
- [ ] 添加Cookie配置（环境变量）
- [ ] UP主全部投稿解析
- [ ] 完整启用WBI签名

### Phase 3: 高级功能
- [ ] DmVerify实现
- [ ] RenderData支持
- [ ] 自动Cookie刷新
- [ ] 多账号轮换

---

## 结论

### 为什么不完全复制RSSHub？

1. **用户体验优先**
   - 大多数用户只需要合集和单视频
   - Cookie配置对普通用户是障碍

2. **MVP原则**
   - 先验证核心功能
   - 快速迭代，根据反馈优化

3. **维护成本**
   - B站API经常变化
   - 简化方案更易维护

4. **技术成熟度**
   - WBI实现已完成（预留）
   - 可在需要时快速启用

### 何时需要完整实现？

当满足以下条件时：
- 📊 大量用户需要UP主全部投稿功能
- 👥 团队有能力维护复杂的验证逻辑
- 🔄 有稳定的Cookie获取方案

---

## 参考资料

- [RSSHub Bilibili Routes](https://github.com/DIYgod/RSSHub/tree/master/lib/routes/bilibili)
- [RSSHub Utils.ts](https://github.com/DIYgod/RSSHub/blob/master/lib/routes/bilibili/utils.ts)
- [B站API文档](https://socialsisteryi.github.io/bilibili-API-collect/)
- [WBI签名算法](https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/misc/sign/wbi.md)

---

## 致谢

感谢RSSHub团队的开源贡献，为我们提供了宝贵的技术参考！

RSSHub: https://github.com/DIYgod/RSSHub
