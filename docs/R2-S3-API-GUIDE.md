# R2 S3 API 使用指南

## 概述

Cloudflare R2 提供 S3 兼容的 API，但**不建议前端直接使用 S3 API**，原因：
1. 需要暴露 Access Key ID 和 Secret Access Key（安全风险）
2. 需要处理签名和认证
3. Worker API 方式更简单、更安全

## 当前实现（推荐）

### 方式：通过 Worker API 提供文件

**工作原理：**
```
前端 → Worker API (/api/downloads/audio/:bvid) → R2 Bucket → 返回文件
```

**优点：**
- ✅ 安全：不需要暴露 S3 凭证
- ✅ 简单：前端直接使用 Worker URL
- ✅ 可控：可以在 Worker 中添加权限检查、日志等
- ✅ 缓存：Worker 可以设置缓存策略

**当前代码：**
```typescript
// backend/src/routes/downloads.ts
downloadRoutes.get('/audio/:bvid', async (c) => {
  const bvid = c.req.param('bvid');
  const audioKey = `audio/${bvid}.m4a`;
  
  const object = await c.env.BUCKET.get(audioKey);
  if (!object) return c.text('Not found', 404);
  
  const audioData = await object.arrayBuffer();
  
  return new Response(audioData, {
    headers: {
      'Content-Type': 'audio/mp4',
      'Cache-Control': 'public, max-age=86400',
      'Accept-Ranges': 'bytes', // 支持范围请求
    },
  });
});
```

**前端使用：**
```typescript
// 直接使用 Worker API URL
const audioUrl = `${API_BASE}/api/downloads/audio/${bvid}`;
<audio src={audioUrl} />
```

## 可选方案

### 方案 1：Worker 重定向到 S3（不推荐）

**实现：**
```typescript
// 需要生成预签名 URL（需要 S3 SDK）
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

downloadRoutes.get('/audio/:bvid', async (c) => {
  const bvid = c.req.param('bvid');
  const audioKey = `audio/${bvid}.m4a`;
  
  // 生成预签名 URL（有效期 1 小时）
  const s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${c.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: c.env.R2_ACCESS_KEY_ID,
      secretAccessKey: c.env.R2_SECRET_ACCESS_KEY,
    },
  });
  
  const command = new GetObjectCommand({
    Bucket: 'b-cast',
    Key: audioKey,
  });
  
  const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  
  return c.redirect(signedUrl, 302);
});
```

**缺点：**
- ❌ 需要配置 S3 凭证（Access Key ID、Secret Access Key）
- ❌ 需要安装额外的 SDK（@aws-sdk/client-s3）
- ❌ 每次请求都要生成签名（性能开销）
- ❌ 重定向会增加延迟

### 方案 2：直接使用 S3 API（不推荐）

**需要配置：**
```bash
# .env
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key-id
R2_SECRET_ACCESS_KEY=your-secret-access-key
R2_BUCKET_NAME=b-cast
R2_ENDPOINT=https://ec8a5af3de4bd1a57d757452b8ac959f.r2.cloudflarestorage.com
```

**前端使用（不推荐）：**
```typescript
// ❌ 不安全：需要在前端暴露凭证
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID, // ⚠️ 暴露在前端代码中
    secretAccessKey: R2_SECRET_ACCESS_KEY, // ⚠️ 严重安全风险
  },
});
```

**为什么不推荐：**
- ❌ **严重安全风险**：凭证会暴露在前端代码中
- ❌ 任何人都可以获取你的 R2 凭证
- ❌ 可能导致 R2 存储被滥用

### 方案 3：使用 R2 公开访问（可选，但不推荐）

**配置：**
1. 在 Cloudflare Dashboard 中启用 R2 的 Public Access
2. 或配置 Custom Domain

**使用：**
```typescript
// 直接访问公开 URL
const audioUrl = `https://pub-xxx.r2.dev/audio/${bvid}.m4a`;
```

**缺点：**
- ❌ 所有文件都公开访问
- ❌ 无法控制访问权限
- ❌ 可能产生额外费用（带宽）

## 推荐方案对比

| 方案 | 安全性 | 性能 | 复杂度 | 推荐度 |
|------|--------|------|--------|--------|
| **Worker API（当前）** | ✅ 高 | ✅ 好 | ✅ 低 | ⭐⭐⭐⭐⭐ |
| Worker 重定向到 S3 | ⚠️ 中 | ⚠️ 中 | ❌ 高 | ⭐⭐ |
| 直接 S3 API | ❌ 低 | ✅ 好 | ❌ 高 | ❌ |
| R2 公开访问 | ❌ 低 | ✅ 好 | ✅ 低 | ⭐ |

## S3 API Endpoint 说明

你看到的这个 URL：
```
https://ec8a5af3de4bd1a57d757452b8ac959f.r2.cloudflarestorage.com/b-cast
```

这是 R2 的 S3 兼容 API endpoint，但：
1. **不需要写到环境变量**（当前实现不需要）
2. **Worker 内部已经通过 `c.env.BUCKET` 访问 R2**，不需要 S3 API
3. **前端不应该直接使用这个 URL**（需要认证）

## 当前架构的优势

```
┌─────────┐         ┌──────────┐         ┌─────┐
│  前端   │ ──────> │  Worker  │ ──────> │ R2  │
│         │         │   API    │         │     │
└─────────┘         └──────────┘         └─────┘
  直接访问             代理访问             存储
  (安全)              (可控)              (私有)
```

**优势：**
1. ✅ R2 凭证只在 Worker 中（服务器端），前端无法访问
2. ✅ Worker 可以添加权限检查、限流、日志等
3. ✅ 前端代码简单，只需要 Worker URL
4. ✅ 可以设置缓存策略，减少 R2 请求

## 总结

**当前实现（Worker API）是最佳方案：**
- ✅ 安全：凭证不暴露
- ✅ 简单：前端直接使用 Worker URL
- ✅ 灵活：可以在 Worker 中添加业务逻辑

**不需要：**
- ❌ 配置 S3 API endpoint 到环境变量
- ❌ 前端直接使用 S3 API
- ❌ Worker 重定向到 S3

**保持当前实现即可！** 🎉
