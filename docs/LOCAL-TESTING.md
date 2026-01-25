# 本地测试快速指南

## 🚀 快速开始

### 1. 启动本地开发环境

```bash
# 终端1: 启动Backend
cd backend
pnpm install
pnpm run dev
# ✅ Backend运行在 http://localhost:8787

# 终端2: 启动Frontend (可选)
cd frontend  
npm install
npm run dev
# ✅ Frontend运行在 http://localhost:5173
```

### 2. 测试数据链路

#### 🔹 添加订阅 (D1写入测试)

```bash
curl -X POST http://localhost:8787/api/subscriptions/add \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://space.bilibili.com/437316738"
  }'
```

成功响应：
```json
{
  "success": true,
  "subscription": {
    "id": "...",
    "name": "UP主名称",
    "rssUrl": "http://localhost:8787/api/subscriptions/rss/xxx.xml"
  }
}
```

#### 🔹 查看下载队列

```bash
curl http://localhost:8787/api/downloads/list | jq
```

#### 🔹 手动触发订阅更新 (Cron逻辑测试)

```bash
curl -X POST http://localhost:8787/api/cron/check-updates | jq
```

#### 🔹 获取待下载任务

```bash
curl http://localhost:8787/api/downloads/pending | jq
```

#### 🔹 模拟更新下载状态

```bash
curl -X POST http://localhost:8787/api/downloads/update-status \
  -H "Content-Type: application/json" \
  -d '{
    "bvid": "BV1xx411c7xx",
    "status": "completed",
    "audioUrl": "https://example.com/audio.m4a",
    "fileSize": 12345678
  }'
```

### 3. 本地运行下载脚本

```bash
# 配置环境变量
export WORKER_URL="http://localhost:8787"
export CLOUDFLARE_API_TOKEN="your-token"
export CLOUDFLARE_ACCOUNT_ID="your-account-id"

# 运行脚本
python scripts/download_worker.py
```

## 📊 查看本地数据

### 方法1: 通过API查询

```bash
# 查看所有订阅
curl http://localhost:8787/api/subscriptions/list | jq

# 查看下载队列
curl http://localhost:8787/api/downloads/list | jq

# 查看待下载任务
curl http://localhost:8787/api/downloads/pending | jq
```

### 方法2: 直接查看SQLite数据库

```bash
cd backend/.wrangler/state/v3/d1/

# 找到.sqlite文件
ls -la miniflare-D1DatabaseObject/

# 使用sqlite3查看
sqlite3 miniflare-D1DatabaseObject/*.sqlite

# SQL查询示例
sqlite> .tables
sqlite> SELECT * FROM subscriptions;
sqlite> SELECT * FROM download_queue;
sqlite> .exit
```

### 方法3: 查看R2存储（本地文件）

```bash
cd backend/.wrangler/state/v3/r2/
ls -la b-cast-audio/
```

## ⚠️ 注意事项

### 本地模拟vs生产环境

| 功能 | 本地环境 | 生产环境 |
|-----|---------|---------|
| D1数据库 | SQLite文件 | 真实D1 |
| R2存储 | 本地文件系统 | 真实R2 |
| Cron触发 | 需手动调用API | 自动定时触发 |
| 下载任务 | 手动运行脚本 | GitHub Action |

### 本地测试的限制

1. ❌ **不能测试真实的Cron定时触发**
   - ✅ 解决方案：调用 `/api/cron/check-updates` 手动触发

2. ❌ **不能测试GitHub Action工作流**
   - ✅ 解决方案：本地运行 `download_worker.py` 脚本

3. ⚠️ **上传到本地R2，不是真实R2**
   - ✅ 解决方案：使用 `wrangler dev --remote` 连接真实R2（谨慎使用）

## 🔄 完整测试流程

```bash
# 1. 启动服务
cd backend && pnpm run dev

# 2. 添加订阅
curl -X POST http://localhost:8787/api/subscriptions/add \
  -H "Content-Type: application/json" \
  -d '{"url":"https://space.bilibili.com/437316738"}'

# 3. 查看下载队列（应该有新任务）
curl http://localhost:8787/api/downloads/pending | jq

# 4. 本地运行下载脚本
python scripts/download_worker.py

# 5. 再次查看队列（状态应该变为completed）
curl http://localhost:8787/api/downloads/list | jq
```

## 📚 更多文档

- [完整数据链路与测试指南](./DATA-FLOW-TESTING.md)
- [部署指南](./DEPLOYMENT.md)
- [API文档](./API.md)
