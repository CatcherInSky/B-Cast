# 实现Cookie支持：开发指南

## 📋 概述

本文档说明如何为B-Cast添加Cookie支持，以实现UP主空间的完整解析功能。

---

## 🎯 实现计划

### Phase 1: 基础Cookie支持

#### 1.1 环境变量配置

**修改 `wrangler.toml`：**
```toml
name = "b-cast-backend"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[vars]
# 开发环境Cookie（可选）
# BILIBILI_COOKIE = "SESSDATA=xxx; bili_jct=xxx; ..."

[[d1_databases]]
binding = "DB"
database_name = "b-cast-mvp"
database_id = "your-database-id"

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "b-cast-audio"
```

**生产环境使用Secret：**
```bash
wrangler secret put BILIBILI_COOKIE
# 粘贴Cookie字符串
```

#### 1.2 修改类型定义

**创建 `backend/src/types/env.ts`：**
```typescript
export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  BILIBILI_COOKIE?: string;  // 可选的Cookie配置
}
```

#### 1.3 更新WBI服务

**修改 `backend/src/services/bilibili-wbi.ts`：**
```typescript
/**
 * 获取WBI密钥
 */
export async function getWbiKeys(cookie?: string): Promise<WbiKeys> {
    // 检查缓存
    if (cachedWbiKeys && Date.now() - cacheTime < CACHE_DURATION) {
        return cachedWbiKeys;
    }
    
    try {
        const headers: Record<string, string> = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Referer': 'https://www.bilibili.com/',
            'Origin': 'https://www.bilibili.com',
            // ... 其他headers
        };
        
        // 如果提供了Cookie，添加到headers
        if (cookie) {
            headers['Cookie'] = cookie;
        }
        
        const response = await fetch('https://api.bilibili.com/x/web-interface/nav', {
            headers
        });
        
        // ... 其余逻辑
    }
}
```

#### 1.4 更新增强版服务

**修改 `backend/src/services/bilibili-wbi-enhanced.ts`：**
```typescript
/**
 * 解析UP主空间（使用WBI + Cookie）
 */
async function parseUploaderWithWbi(url: string, cookie?: string) {
  const uid = url.match(/space\.bilibili\.com\/(\d+)/)?.[1];
  
  if (!uid) {
    throw new Error('无效的UP主URL');
  }
  
  // 1. 获取UP主信息（不需要Cookie）
  const userResponse = await fetch(`${USER_INFO_API}?mid=${uid}`, {
    headers: COMMON_HEADERS
  });
  
  const userData = await userResponse.json();
  if (userData.code !== 0) {
    throw new Error(`获取UP主信息失败: ${userData.message}`);
  }
  
  const name = userData.data.name;
  const face = userData.data.face;
  
  // 2. 获取视频列表（需要WBI签名，Cookie可选但推荐）
  const baseParams = {
    mid: uid,
    ps: '30',
    tid: '0',
    pn: '1',
    keyword: '',
    order: 'pubdate',
    platform: 'web',
    web_location: '1550101',
    order_avoided: 'true'
  };
  
  // 添加WBI签名（如果有Cookie，传递给getWbiKeys）
  const signedUrl = await addWbiVerifyInfo(UP_VIDEO_API, baseParams, cookie);
  
  const videoHeaders: Record<string, string> = {
    ...COMMON_HEADERS,
    'Referer': `https://space.bilibili.com/${uid}`,
    'Origin': 'https://space.bilibili.com',
  };
  
  // 如果有Cookie，添加到请求
  if (cookie) {
    videoHeaders['Cookie'] = cookie;
  }
  
  const videoResponse = await fetch(signedUrl, { headers: videoHeaders });
  const videoData = await videoResponse.json();
  
  if (videoData.code !== 0) {
    throw new Error(`获取视频列表失败: ${videoData.message}`);
  }
  
  // ... 其余逻辑
}

// 导出函数，接受cookie参数
export async function parseBilibiliWbi(url: string, cookie?: string) {
  if (url.includes('collectiondetail')) {
    return parseCollection(url);
  } else if (url.includes('space.bilibili.com')) {
    return parseUploaderWithWbi(url, cookie);
  } else if (url.includes('/video/')) {
    return parseSingleVideo(url);
  }
  
  throw new Error('不支持的URL类型');
}
```

#### 1.5 更新路由

**修改 `backend/src/routes/bilibili.ts`：**
```typescript
import { Hono } from 'hono';
import { parseBilibili } from '../services/bilibili';
import { parseBilibiliWbi } from '../services/bilibili-wbi-enhanced';
import type { Env } from '../types/env';

export const bilibiliRoutes = new Hono<{ Bindings: Env }>();

bilibiliRoutes.post('/parse', async (c) => {
  try {
    const { url } = await c.req.json();

    if (!url) {
      return c.json({ success: false, error: '缺少URL参数' }, 400);
    }

    // 获取环境变量中的Cookie（如果有）
    const cookie = c.env.BILIBILI_COOKIE;

    // 如果是UP主空间
    if (url.includes('space.bilibili.com') && !url.includes('collectiondetail')) {
      // 检查是否有Cookie
      if (!cookie) {
        return c.json({
          success: false,
          error: '解析UP主空间需要配置B站Cookie',
          hint: '请参考文档配置BILIBILI_COOKIE环境变量：docs/HOW-TO-GET-BILIBILI-COOKIE.md',
          fallback: '提示：你可以使用合集URL或单视频URL，这些不需要Cookie'
        }, 400);
      }

      // 使用WBI方案（带Cookie）
      try {
        const result = await parseBilibiliWbi(url, cookie);
        return c.json({
          success: true,
          data: result,
          method: 'wbi-with-cookie'
        });
      } catch (wbiError: any) {
        console.error('WBI解析失败:', wbiError);
        return c.json({
          success: false,
          error: `解析失败: ${wbiError.message}`,
          hint: 'Cookie可能已过期，请重新获取'
        }, 500);
      }
    }

    // 合集和单视频使用简化方案（不需要Cookie）
    const result = await parseBilibili(url);
    return c.json({
      success: true,
      data: result,
      method: 'simplified'
    });

  } catch (error: any) {
    console.error('解析失败:', error);
    return c.json({
      success: false,
      error: error.message || '解析失败'
    }, 500);
  }
});
```

---

## 🧪 测试

### 1. 本地测试

**创建 `backend/.dev.vars`：**
```
BILIBILI_COOKIE="SESSDATA=xxx; bili_jct=xxx; DedeUserID=xxx; DedeUserID__ckMd5=xxx"
```

**运行开发服务器：**
```bash
cd backend
pnpm dev
```

**测试请求：**
```bash
curl -X POST http://localhost:8787/api/bilibili/parse \
  -H "Content-Type: application/json" \
  -d '{"url": "https://space.bilibili.com/546195"}'
```

### 2. 生产部署

**设置Secret：**
```bash
wrangler secret put BILIBILI_COOKIE
# 粘贴完整的Cookie字符串
```

**部署：**
```bash
wrangler deploy
```

---

## 📊 功能对比

| 功能 | 无Cookie | 有Cookie |
|------|---------|---------|
| 合集解析 | ✅ | ✅ |
| 单视频 | ✅ | ✅ |
| UP主空间 | ❌ | ✅ |
| WBI签名 | ⚠️ 有限 | ✅ 完整 |

---

## 🔒 安全最佳实践

### 1. 使用Secret而不是环境变量

**❌ 不好：**
```toml
[vars]
BILIBILI_COOKIE = "SESSDATA=..."  # 会暴露在日志中
```

**✅ 好：**
```bash
wrangler secret put BILIBILI_COOKIE  # 加密存储
```

### 2. 不要提交到Git

**`.gitignore`：**
```
.dev.vars
.env
*.local
```

### 3. 定期轮换Cookie

- 建议每月更换一次
- 使用脚本自动检测Cookie是否有效

---

## 📝 前端提示

### 更新错误消息

**修改 `frontend/src/components/AddPlaylist.tsx`：**
```typescript
if (!response.success) {
  if (response.hint) {
    // 显示友好的提示信息
    setError(`${response.error}\n\n💡 ${response.hint}`);
  } else {
    setError(response.error);
  }
}
```

---

## 🚀 部署清单

- [ ] 获取B站Cookie
- [ ] 验证Cookie有效性
- [ ] 设置Cloudflare Secret
- [ ] 更新代码以支持Cookie
- [ ] 本地测试
- [ ] 部署到生产环境
- [ ] 测试UP主空间解析
- [ ] 更新文档

---

## 📚 相关文档

- [如何获取Cookie](./HOW-TO-GET-BILIBILI-COOKIE.md)
- [API限制说明](./BILIBILI-API-LIMITATIONS.md)
- [最终方案](./FINAL-SOLUTION.md)

---

**预计工作量：** 2-4小时  
**难度：** 中等  
**优先级：** 可选（v1.1功能）
