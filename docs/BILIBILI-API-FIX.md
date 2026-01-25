# B站API访问权限问题修复

## 问题描述

使用UP主空间URL时出现 **"获取视频列表失败: 访问权限不足"** 错误。

## 原因分析

B站的新版API `/x/space/wbi/arc/search` 需要 **WBI 签名验证**，这是B站的反爬虫机制。如果不提供正确的签名，会返回 `-352` 错误（访问权限不足）。

## 解决方案

### ✅ 已实施的修复

1. **使用旧版API**
   - 从 `/x/space/wbi/arc/search`（需要签名）
   - 改为 `/x/space/arc/search`（不需要签名）

2. **添加完整的请求头**
   ```typescript
   const COMMON_HEADERS = {
     'User-Agent': '...',
     'Accept': 'application/json, text/plain, */*',
     'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
     'Accept-Encoding': 'gzip, deflate, br',
     'Connection': 'keep-alive',
     'Sec-Fetch-Dest': 'empty',
     'Sec-Fetch-Mode': 'cors',
     'Sec-Fetch-Site': 'same-site',
   }
   ```

3. **简化请求参数**
   - 移除了可能触发验证的参数（`platform`, `web_location`）

## 使用方法

### 1. 重新部署后端

```bash
cd backend
wrangler deploy
```

### 2. 测试

现在可以正常解析以下类型的URL：

✅ **UP主空间**
```
https://space.bilibili.com/3493085779869
```

✅ **视频合集**
```
https://space.bilibili.com/3493085779869/channel/collectiondetail?sid=123
```

✅ **单个视频**
```
https://www.bilibili.com/video/BV1xx4y1x7xx
```

## 如果还是失败

### 方案1：降低请求频率
B站可能检测到频繁请求，建议：
- 不要短时间内添加多个播放列表
- 间隔至少5-10秒

### 方案2：只解析视频和合集
- 先测试单个视频URL
- 再测试合集URL
- UP主空间URL如果持续失败，可以使用合集

### 方案3：本地测试
在本地环境测试，可能比Workers环境更容易成功：

```bash
cd backend
wrangler dev --local

# 在另一个终端测试
curl -X POST http://localhost:8787/api/bilibili/parse \
  -H "Content-Type: application/json" \
  -d '{"url": "https://space.bilibili.com/3493085779869"}'
```

## 长期解决方案

如果旧版API也被B站限制，可以考虑：

1. **实现WBI签名验证**（复杂）
   - 需要获取和缓存WBI keys
   - 实现签名算法
   - 参考RSSHub的实现

2. **使用代理服务**
   - 通过第三方代理访问B站API
   - 增加成本但更稳定

3. **提供Cookie选项**
   - 让用户提供自己的B站Cookie
   - 使用已登录的账户访问

## 相关文档

- [RSSHub B站路由](https://github.com/DIYgod/RSSHub/tree/master/lib/routes/bilibili)
- [B站API文档](https://socialsisteryi.github.io/bilibili-API-collect/)

## 更新日志

- **2026-01-23**: 修复UP主空间解析"访问权限不足"问题
  - 使用旧版API
  - 添加完整请求头
  - 简化请求参数
