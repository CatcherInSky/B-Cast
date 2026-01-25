# WBI签名调试指南

## 🐛 问题排查

### 问题1: gzip压缩响应未解压

**症状：**
```
✘ [ERROR] Invalid JSON: !�`�Fj��)t�||��&���6v��V,�^8���y쁴��Ƙ�)
```

**原因：**
- 设置了 `Accept-Encoding: gzip, deflate, br`
- 但响应的gzip数据没有被自动解压
- Cloudflare Workers的fetch在某些情况下不会自动解压

**解决方案：**
1. ❌ 不要手动设置 `Accept-Encoding` header
2. ✅ 让Cloudflare Workers自动处理压缩
3. ✅ 直接使用 `response.json()` 而不是 `response.text()`

**修复前：**
```typescript
const COMMON_HEADERS = {
  'Accept-Encoding': 'gzip, deflate, br',  // ❌ 导致问题
  // ...
};

const videoText = await videoResponse.text();  // ❌ 可能获取到压缩数据
const videoData = JSON.parse(videoText);
```

**修复后：**
```typescript
const COMMON_HEADERS = {
  // 不设置 Accept-Encoding，让fetch自动处理
  // ...
};

const videoData = await videoResponse.json();  // ✅ 自动解压和解析
```

---

### 问题2: `-799 请求过于频繁`

**症状：**
```json
{"code":-799,"message":"请求过于频繁，请稍后再试","ttl":1}
```

**原因：**
- B站API有频率限制
- 重复请求触发风控

**解决方案：**
1. 使用WBI签名（正确实现）
2. 添加合理的延迟
3. 实现请求缓存

---

## 🔍 调试步骤

### 1. 检查WBI Keys获取

**正常输出：**
```
Fetching WBI keys from Bilibili API...
✅ WBI keys fetched: {
  imgKey: '7cd084941...',
  subKey: '4932caff0...',
  loginStatus: 'guest'
}
```

**检查点：**
- ✅ imgKey和subKey都有值
- ✅ loginStatus可以是 'guest' 或 'logged in'
- ✅ 没有错误信息

---

### 2. 检查WBI签名生成

**正常输出：**
```
🔐 Adding WBI signature...
✅ WBI signature added
📡 Fetching videos from: https://api.bilibili.com/x/space/wbi/arc/search?keyword=&mid=...&w_rid=...&wts=...
```

**验证签名：**
```typescript
// 签名URL应该包含：
// - 所有原始参数
// - wts（时间戳）
// - w_rid（MD5签名）
```

---

### 3. 检查API响应

**正常输出：**
```
📊 API Response: {
  code: 0,
  message: '0',
  hasData: true,
  hasList: true,
  hasVlist: true
}
✅ Found 30 videos
```

**错误响应：**
```javascript
// code !== 0 表示有错误
{
  code: -799,  // 请求过于频繁
  code: -352,  // 风控校验失败
  code: -403,  // 访问权限不足
}
```

---

## 🛠️ 修复清单

### ✅ 已修复

1. **移除手动 Accept-Encoding**
   ```typescript
   // ❌ 移除
   'Accept-Encoding': 'gzip, deflate, br',
   ```

2. **使用 response.json() 直接解析**
   ```typescript
   // ✅ 正确
   const videoData = await videoResponse.json();
   ```

3. **禁用fallback，专注WBI调试**
   ```typescript
   // 直接抛出错误，不使用简化方案
   const result = await parseBilibiliWbi(url);
   ```

4. **增强错误日志**
   ```typescript
   console.error('❌ Failed to parse JSON response:', {
     error: e.message,
     responsePreview: text.substring(0, 200),
     contentType: videoResponse.headers.get('content-type'),
     contentEncoding: videoResponse.headers.get('content-encoding')
   });
   ```

---

## 🧪 测试命令

### 重启Backend
```bash
# Terminal 1
cd backend
pnpm dev
```

### 测试UP主空间
```bash
# Terminal 2
curl -X POST http://localhost:8787/api/bilibili/parse \
  -H "Content-Type: application/json" \
  -d '{"url": "https://space.bilibili.com/486949400"}'
```

### 预期成功输出
```
📥 Parsing URL: https://space.bilibili.com/486949400
🎯 Detected: UP主空间，使用WBI方案
Fetching WBI keys from Bilibili API...
✅ WBI keys fetched: { imgKey: '...', subKey: '...', loginStatus: 'guest' }
📝 Building WBI params for UP 486949400
🔐 Adding WBI signature...
✅ WBI signature added
📡 Fetching videos from: https://api.bilibili.com/x/space/wbi/arc/search?...
📊 API Response: { code: 0, message: '0', hasData: true, ... }
✅ Found 30 videos
```

---

## 📋 常见错误码

| Code | 含义 | 解决方案 |
|------|------|---------|
| 0 | 成功 | ✅ |
| -101 | 账号未登录 | 正常，WBI Keys仍可用 |
| -352 | 风控校验失败 | 检查WBI签名是否正确 |
| -403 | 访问权限不足 | 检查headers和签名 |
| -799 | 请求过于频繁 | 降低请求频率 |
| -400 | 请求错误 | 检查参数格式 |

---

## 🔧 Cloudflare Workers特性

### Accept-Encoding处理

**规则：**
- ❌ 不要手动设置 `Accept-Encoding`
- ✅ Cloudflare会自动协商和处理压缩
- ✅ `response.json()` 会自动解压

**参考：**
[Cloudflare Workers - Compression](https://developers.cloudflare.com/workers/runtime-apis/request/#requestinitcfproperties)

### fetch API差异

```typescript
// Node.js / Browser
const text = await response.text();  // 可能需要手动解压

// Cloudflare Workers
const data = await response.json();  // 自动解压 + 解析 ✅
```

---

## 📊 调试检查清单

运行测试前检查：

- [ ] Backend已重启（`pnpm dev`）
- [ ] 没有其他进程占用端口8787
- [ ] 代码已保存
- [ ] 没有linter错误
- [ ] WBI签名实现正确
- [ ] 移除了 Accept-Encoding header
- [ ] 使用 response.json() 解析
- [ ] 禁用了fallback机制

---

## 🎯 下一步

如果测试成功：
1. ✅ 验证WBI签名工作正常
2. ✅ 恢复合理的fallback机制
3. ✅ 添加频率限制保护
4. ✅ 优化错误处理

如果仍有问题：
1. 检查console完整输出
2. 验证WBI Keys是否正确提取
3. 检查API响应的原始内容
4. 对比RSSHub的实现

---

**更新日期：** 2026-01-23  
**问题状态：** 🔧 修复中
