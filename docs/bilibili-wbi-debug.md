# B站WBI签名调试指南

## 问题分析

### 错误1：获取WBI keys失败
```
Failed to get WBI keys: 账号未登录
```

**原因：** 请求headers不完整，被B站识别为非浏览器请求

### 错误2：Fallback失败
```
SyntaxError: Unexpected token '!', "!{"code"... is not valid JSON
```

**原因：** B站返回HTML错误页面而不是JSON，说明请求被拦截

## 修复方案

### 1. 完善Headers

按照RSSHub的实现，添加**完整的浏览器headers**：

```typescript
{
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Referer': 'https://www.bilibili.com/',
  'Origin': 'https://www.bilibili.com',
  'Connection': 'keep-alive',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-site',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache'
}
```

### 2. 增强错误处理

- 先检查HTTP状态码
- 解析响应为文本，检查是否为JSON
- 详细的错误日志输出

### 3. 数据验证

- 检查响应结构是否完整
- 验证提取的WBI keys

## 与RSSHub的对比

### RSSHub的实现特点

1. **完整的headers**：模拟真实浏览器
2. **错误处理**：详细的错误信息
3. **缓存机制**：10分钟缓存WBI keys
4. **数据验证**：检查每一步的数据

### 我们的改进

✅ 添加完整的浏览器headers
✅ 增强错误处理和日志
✅ 数据结构验证
✅ 缓存机制（已有）

## 测试方法

### 1. 测试WBI keys获取

```bash
# 在backend目录
pnpm dev

# 查看console输出
# 应该看到：WBI keys fetched successfully
```

### 2. 测试UP主解析

```bash
# 在frontend，添加UP主URL
https://space.bilibili.com/546195

# 检查backend console
# 应该看到详细的日志输出
```

### 3. 检查日志

**成功的日志：**
```
Nav API response: {"code":0,"message":"0","ttl":1,"data":{"wbi_img":...
WBI keys fetched successfully: { imgKey: 'xxxxxxxx', subKey: 'yyyyyyyy' }
Fetching with WBI: https://api.bilibili.com/x/space/wbi/arc/search?...&w_rid=...
```

**失败的日志：**
```
✘ [ERROR] Failed to get WBI keys: 账号未登录
Invalid JSON response: <!DOCTYPE html>...
```

## 下一步

如果还有问题：

1. **检查是否被IP限制**
   - B站可能对某些IP有访问限制
   - 可以尝试添加代理

2. **使用降级方案**
   - 如果WBI持续失败，使用简化版API
   - 目前已经有fallback机制

3. **考虑Cookie**
   - RSSHub有时会使用Cookie来提高成功率
   - 可以在环境变量中配置BILIBILI_COOKIE

## 参考资料

- [RSSHub Bilibili Utils](https://github.com/DIYgod/RSSHub/blob/master/lib/routes/bilibili/utils.ts)
- [Bilibili API文档](https://socialsisteryi.github.io/bilibili-API-collect/)
- [WBI签名算法](https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/misc/sign/wbi.md)
