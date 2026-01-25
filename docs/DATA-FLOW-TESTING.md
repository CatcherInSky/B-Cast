# 数据链路与测试指南

## 📊 数据链路总览

### 1. 前端输入B站URL → 解析生成RSS → 写入D1数据库

**流程：**
```
用户输入 → POST /api/subscriptions/add 
         → 解析B站URL（bilibili.ts）
         → 生成RSS XML
         → 保存到R2 (rss/{id}.xml)
         → 写入D1 (subscriptions + subscription_items + download_queue)
```

**本地测试：✅ 完全支持**
```bash
cd backend
pnpm run dev  # 使用本地模拟的D1和R2
```

---

### 2. 前端导入RSS → 写入D1数据库

**流程：**
```
用户导入RSS URL → 解析RSS内容 
                → 写入D1数据库
```

**本地测试：✅ 完全支持**
- 本地开发环境下数据写入 `.wrangler/state/v3/d1/` 目录

---

### 3. 手动触发下载 → 读取D1 → 下载并上传R2

**改进后的架构：**

```
┌─────────────────────────────────────────────────────────────┐
│              前端 / 用户                                      │
└─────────────┬───────────────────────────────────────────────┘
              │ 手动触发
              ↓
┌─────────────────────────────────────────────────────────────┐
│         Cloudflare Workers (Backend API)                     │
│  POST /api/downloads/trigger-download                        │
│    → 触发 GitHub Action                                      │
└─────────────┬───────────────────────────────────────────────┘
              │
              ↓
┌─────────────────────────────────────────────────────────────┐
│              GitHub Actions                                  │
│  1. GET /api/downloads/pending (获取待下载列表)             │
│  2. 使用 yt-dlp 下载音频                                     │
│  3. 使用 wrangler 上传到 R2                                  │
│  4. POST /api/downloads/update-status (更新完成状态)         │
└─────────────────────────────────────────────────────────────┘
```

**本地测试：⚠️ 部分支持**

可以本地测试的部分：
```bash
# 1. 获取待下载列表
curl http://localhost:8787/api/downloads/pending

# 2. 本地运行下载脚本（连接本地Worker）
export WORKER_URL="http://localhost:8787"
export CLOUDFLARE_API_TOKEN="your-token"
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
python scripts/download_worker.py
```

只能部署后测试：
- GitHub Action 的实际触发流程
- 上传到生产环境的 R2

---

### 4. Cronjob定时触发检查RSS更新 → 更新D1数据库

**流程：**
```
Cloudflare Cron Trigger (每天2:00 UTC)
  → scheduled() 函数
  → checkSubscriptionUpdates()
  → 遍历所有订阅
  → 检查新视频
  → 更新D1和R2
```

**本地测试：⚠️ 需要手动触发**

**✅ 推荐方式：通过API手动触发**
```bash
# 启动本地开发服务器
cd backend
pnpm run dev

# 在另一个终端手动触发cron逻辑
curl -X POST http://localhost:8787/api/cron/check-updates
```

**❌ 不能本地测试：**
- 真实的定时触发（只在生产环境工作）

---

## 🔧 完整的本地测试流程

### 前置准备

1. **安装依赖**
```bash
# Backend
cd backend
pnpm install

# Frontend
cd ../frontend
npm install

# Python脚本依赖
pip install yt-dlp requests
npm install -g wrangler
```

2. **初始化数据库**
```bash
cd backend
# 运行一次dev会自动创建本地D1数据库
pnpm run dev
```

### 测试步骤

#### 步骤1: 启动本地服务

```bash
# Terminal 1: 启动Backend
cd backend
pnpm run dev
# 访问 http://localhost:8787

# Terminal 2: 启动Frontend
cd frontend
npm run dev
# 访问 http://localhost:5173
```

#### 步骤2: 测试添加订阅

```bash
# 方式1: 通过前端UI
# 在浏览器中打开 http://localhost:5173 并添加订阅

# 方式2: 直接调用API
curl -X POST http://localhost:8787/api/subscriptions/add \
  -H "Content-Type: application/json" \
  -d '{"url":"https://space.bilibili.com/123456"}'
```

#### 步骤3: 查看下载队列

```bash
curl http://localhost:8787/api/downloads/list
```

#### 步骤4: 测试手动触发Cron

```bash
curl -X POST http://localhost:8787/api/cron/check-updates
```

#### 步骤5: 本地运行下载脚本

```bash
# 设置环境变量
export WORKER_URL="http://localhost:8787"
export CLOUDFLARE_API_TOKEN="your-api-token"
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
export R2_BUCKET_NAME="b-cast-audio"

# 运行下载脚本
python scripts/download_worker.py
```

---

## 🌐 部署后测试流程

### 1. 部署到Cloudflare

```bash
cd backend
pnpm run deploy
```

### 2. 配置GitHub Secrets

在 GitHub 仓库 Settings → Secrets and variables → Actions 中添加：

```
WORKER_URL=https://b-cast-mvp.your-subdomain.workers.dev
CLOUDFLARE_API_TOKEN=your-cloudflare-api-token
CLOUDFLARE_ACCOUNT_ID=your-account-id
R2_BUCKET_NAME=b-cast-audio
GITHUB_TOKEN=自动提供，无需手动添加
BILIBILI_SESSDATA=（可选）你的B站Cookie
```

### 3. 测试真实Cron触发

```bash
# 方式1: 手动触发API（立即执行）
curl -X POST https://your-worker.workers.dev/api/cron/check-updates

# 方式2: 等待定时任务（每天2:00 UTC）
# 在Cloudflare Dashboard → Workers → Cron Triggers 查看执行日志
```

### 4. 测试GitHub Action下载

```bash
# 方式1: 通过API触发
curl -X POST https://your-worker.workers.dev/api/downloads/trigger-download

# 方式2: 在GitHub手动触发
# 访问 Actions → Download Audio from Bilibili → Run workflow
```

---

## 🎯 新增的API Endpoints

### 1. 获取待下载列表

```bash
GET /api/downloads/pending
```

响应：
```json
{
  "success": true,
  "count": 3,
  "items": [
    {
      "id": "uuid",
      "bvid": "BV1xx411c7xx",
      "title": "视频标题",
      "duration": 300
    }
  ]
}
```

### 2. 更新下载状态

```bash
POST /api/downloads/update-status
Content-Type: application/json

{
  "bvid": "BV1xx411c7xx",
  "status": "completed",  // 或 "downloading", "failed"
  "audioUrl": "https://...",  // 可选
  "fileSize": 12345678,       // 可选
  "error": "错误信息"          // 可选
}
```

### 3. 手动触发Cron任务

```bash
POST /api/cron/check-updates
```

响应：
```json
{
  "success": true,
  "totalNewItems": 5,
  "updatedSubscriptions": ["订阅1", "订阅2"],
  "checkedCount": 3
}
```

### 4. 触发GitHub Action下载

```bash
POST /api/downloads/trigger-download
```

⚠️ **需要配置环境变量：**
- `GITHUB_TOKEN` - GitHub Personal Access Token
- `GITHUB_REPO` - 格式: `owner/repo`

---

## ⚠️ Cloudflare Workers 限制说明

### 为什么不在Worker中直接下载？

**CPU时间限制：**
- 常规请求：10ms (免费) / 50ms (付费)
- Cron/Queue：30秒 CPU时间

**下载音频的实际耗时：**
- 单个视频：1-5分钟
- ✅ **解决方案：使用GitHub Actions**

### GitHub Actions的优势

- ✅ 无时间限制（单个job最长6小时）
- ✅ 免费额度充足（公开仓库无限制）
- ✅ 可以使用yt-dlp等工具
- ✅ 并行处理多个下载任务

---

## 📝 建议的工作流程

### 开发阶段（本地）

1. ✅ 使用 `wrangler dev` 测试所有API
2. ✅ 使用手动API触发cron逻辑
3. ✅ 本地运行下载脚本（连接本地Worker）
4. ✅ 快速迭代，无需等待部署

### 部署阶段（生产）

1. 🚀 部署 Workers 到 Cloudflare
2. 🔐 配置 GitHub Secrets
3. ⏰ 验证 Cron 定时任务
4. 📥 验证 GitHub Action 下载流程

---

## 🐛 调试技巧

### 查看本地D1数据库

```bash
# 进入wrangler状态目录
cd backend/.wrangler/state/v3/d1/

# 使用sqlite3查看
sqlite3 miniflare-D1DatabaseObject/*.sqlite

# 查询示例
SELECT * FROM subscriptions;
SELECT * FROM download_queue;
```

### 查看Worker日志

```bash
# 本地开发
# 直接在终端查看输出

# 生产环境
wrangler tail
```

### 查看GitHub Action日志

访问：`https://github.com/your-username/B-Cast/actions`

---

## 🎉 总结

| 数据链路 | 本地测试 | 部署后测试 | 说明 |
|---------|---------|-----------|------|
| 添加订阅 → D1 | ✅ | ✅ | 完全支持本地测试 |
| 导入RSS → D1 | ✅ | ✅ | 完全支持本地测试 |
| 手动下载 → R2 | ⚠️ | ✅ | 可以本地运行脚本，但上传到本地R2 |
| Cron更新 → D1 | ⚠️ | ✅ | 可以通过API手动触发测试逻辑 |

**关键改进：**
- ✅ 所有数据操作都可以本地测试
- ✅ 提供手动触发endpoint方便开发调试
- ✅ 使用GitHub Actions避免Worker超时限制
- ✅ 通过API交互，避免直接访问D1的权限问题
