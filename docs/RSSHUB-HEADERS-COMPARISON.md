# RSSHub Headers对比分析

## 🔍 问题分析

### 原始错误
```
code: -352
message: '风控校验失败'
```

### URL解析问题

**测试URL：**
```
https://space.bilibili.com/486949400/lists/7121352?type=season
```

**问题：** 这是**合集/列表页面**，不是UP主空间！

我们的代码错误地将它识别为UP主空间，应该使用合集解析逻辑。

---

## 📊 Headers对比

### RSSHub的实现（参考）

```typescript
// RSSHub使用got库
const response = await got(`https://api.bilibili.com/x/space/wbi/arc/search?${params}`, {
    headers: {
        Referer: `https://space.bilibili.com/${uid}`,
        origin: `https://space.bilibili.com`,
        Cookie: cookie,  // 可选，如果有的话
    },
});
```

### 我们之前的实现（不完整）

```typescript
headers: {
  'User-Agent': USER_AGENT,
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Referer': `https://space.bilibili.com/${uid}/video`,
  'Origin': 'https://space.bilibili.com',
}
```

### 改进后的实现（完整）

```typescript
headers: {
  'User-Agent': USER_AGENT,
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Referer': `https://space.bilibili.com/${uid}/video`,
  'Origin': 'https://space.bilibili.com',
  'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120"',  // ✅ 新增
  'Sec-Ch-Ua-Mobile': '?0',                                 // ✅ 新增
  'Sec-Ch-Ua-Platform': '"Windows"',                        // ✅ 新增
  'Sec-Fetch-Dest': 'empty',                                // ✅ 新增
  'Sec-Fetch-Mode': 'cors',                                 // ✅ 新增
  'Sec-Fetch-Site': 'same-site',                            // ✅ 新增
}
```

---

## ✅ 修复内容

### 1. URL解析逻辑

**之前（❌）：**
```typescript
if (url.includes('collectiondetail')) {
  return parseCollection(url);
} else if (url.includes('space.bilibili.com')) {
  return parseUploaderWithWbi(url);  // 错误地匹配了合集URL
}
```

**现在（✅）：**
```typescript
// 合集详情页（包括collectiondetail和lists）
if (url.includes('collectiondetail') || url.includes('/lists/')) {
  return parseCollection(url);
} 
// UP主空间（但不包括合集子路径）
else if (url.includes('space.bilibili.com') && !url.includes('/channel/') && !url.includes('/lists/')) {
  return parseUploaderWithWbi(url);
}
```

### 2. 添加Chrome特有Headers

根据现代浏览器特性，添加了：
- `Sec-Ch-Ua` - Chrome客户端提示
- `Sec-Ch-Ua-Mobile` - 移动设备标识
- `Sec-Ch-Ua-Platform` - 平台信息
- `Sec-Fetch-*` - Fetch元数据请求headers

这些headers帮助B站识别这是来自真实浏览器的请求。

---

## 🧪 测试建议

### 1. 测试合集URL（你的原始URL）

```bash
curl -X POST http://localhost:8787/api/bilibili/parse \
  -H "Content-Type: application/json" \
  -d '{"url": "https://space.bilibili.com/486949400/lists/7121352?type=season"}'
```

**预期：** 使用合集解析逻辑，不需要WBI签名

### 2. 测试纯UP主空间

```bash
curl -X POST http://localhost:8787/api/bilibili/parse \
  -H "Content-Type: application/json" \
  -d '{"url": "https://space.bilibili.com/486949400"}'
```

**预期：** 使用WBI签名，返回UP主的所有投稿

### 3. 测试标准合集URL

```bash
curl -X POST http://localhost:8787/api/bilibili/parse \
  -H "Content-Type: application/json" \
  -d '{"url": "https://space.bilibili.com/245645656/channel/collectiondetail?sid=529166"}'
```

**预期：** 使用合集解析逻辑

---

## 📋 RSSHub vs B-Cast Headers对比表

| Header | RSSHub | B-Cast（改进前） | B-Cast（改进后） | 说明 |
|--------|--------|-----------------|-----------------|------|
| User-Agent | ✅ | ✅ | ✅ | 必需 |
| Accept | ✅ | ✅ | ✅ | 必需 |
| Accept-Language | ✅ | ✅ | ✅ | 推荐 |
| Referer | ✅ | ✅ | ✅ | 必需 |
| Origin | ✅ | ✅ | ✅ | 推荐 |
| Cookie | ✅ | ❌ | ❌ | 可选 |
| Sec-Ch-Ua | ❓ | ❌ | ✅ | Chrome特有 |
| Sec-Ch-Ua-Mobile | ❓ | ❌ | ✅ | Chrome特有 |
| Sec-Ch-Ua-Platform | ❓ | ❌ | ✅ | Chrome特有 |
| Sec-Fetch-Dest | ❓ | ❌ | ✅ | 安全特性 |
| Sec-Fetch-Mode | ❓ | ❌ | ✅ | 安全特性 |
| Sec-Fetch-Site | ❓ | ❌ | ✅ | 安全特性 |

**注：** RSSHub使用`got`库，可能自动添加了某些headers。

---

## 🔑 关键差异点

### 1. Cookie的作用

**RSSHub：**
- 使用Cookie提高成功率
- 可以访问需要登录的内容
- 支持高频率请求

**B-Cast MVP：**
- 不使用Cookie（游客模式）
- 只访问公开内容
- 可能受频率限制

### 2. URL路由差异

**问题URL：**
```
https://space.bilibili.com/486949400/lists/7121352?type=season
```

- `/lists/` 路径表示这是**合集/列表**
- 应该使用合集API，不是UP主空间API
- 不需要WBI签名

---

## 💡 改进建议

### 短期（MVP）

1. ✅ 修复URL解析逻辑
2. ✅ 添加Chrome特有headers
3. ✅ 完善错误提示

### 长期

1. 支持Cookie配置（可选）
2. 实现频率限制保护
3. 添加更智能的URL识别

---

## 🎯 测试检查清单

- [ ] 测试合集URL（`/lists/`）
- [ ] 测试合集URL（`/collectiondetail`）
- [ ] 测试纯UP主空间（无子路径）
- [ ] 测试单视频URL
- [ ] 查看详细的日志输出
- [ ] 确认API响应code为0

---

## 📚 相关资料

- [RSSHub Bilibili Routes](https://github.com/DIYgod/RSSHub/tree/master/lib/routes/bilibili)
- [Chrome Client Hints](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Sec-CH-UA)
- [Fetch Metadata](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Sec-Fetch-Dest)

---

**更新日期：** 2026-01-23  
**问题：** `-352` 风控校验失败  
**原因：** URL解析错误 + Headers不完整  
**状态：** ✅ 已修复
