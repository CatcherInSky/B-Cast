# RSS订阅功能 - 快速开始

## 🚀 部署步骤

### 1. 创建数据库表

```bash
cd backend
wrangler d1 execute b-cast-mvp --file=../scripts/subscriptions.sql
```

验证表是否创建成功：

```bash
wrangler d1 execute b-cast-mvp --command="SELECT name FROM sqlite_master WHERE type='table'"
```

应该看到：
- `download_queue`
- `subscriptions`
- `subscription_items`

### 2. 更新Worker配置

编辑 `backend/wrangler.toml`，将 `WORKER_URL` 改为你的实际Worker URL：

```toml
[vars]
WORKER_URL = "b-cast-mvp.你的子域名.workers.dev"
```

### 3. 部署到Cloudflare

```bash
cd backend
pnpm install  # 如果还没有安装依赖
pnpm run deploy
```

### 4. 测试定时任务（可选）

```bash
# 本地测试定时任务
wrangler dev --test-scheduled
```

---

## 🧪 测试API

### 测试1：添加订阅

```bash
curl -X POST https://你的worker.workers.dev/api/subscriptions/add \
  -H "Content-Type: application/json" \
  -d '{"url": "https://space.bilibili.com/3493085779869"}'
```

**预期响应：**
```json
{
  "success": true,
  "data": {
    "id": "550e8400-...",
    "name": "UP主的投稿",
    "rssUrl": "https://你的worker.workers.dev/api/subscriptions/rss/550e8400-....xml",
    "itemCount": 25
  }
}
```

### 测试2：获取RSS XML

复制上面返回的 `rssUrl`，在浏览器中打开：

```
https://你的worker.workers.dev/api/subscriptions/rss/550e8400-....xml
```

应该看到标准的RSS XML格式。

### 测试3：查看订阅列表

```bash
curl https://你的worker.workers.dev/api/subscriptions/list
```

### 测试4：手动刷新订阅

```bash
curl -X POST https://你的worker.workers.dev/api/subscriptions/refresh/550e8400-...
```

### 测试5：检查下载队列

```bash
curl https://你的worker.workers.dev/api/downloads/list
```

应该能看到订阅中的视频已经添加到下载队列。

---

## 📱 在RSS阅读器中测试

### 推荐的RSS阅读器

- **桌面端**: Feedly, Inoreader, NewsBlur
- **移动端**: Reeder, NetNewsWire
- **播客端**: Apple Podcasts, Pocket Casts

### 添加订阅

1. 复制RSS URL（从第一步API返回的 `rssUrl`）
2. 在RSS阅读器中选择"添加订阅"或"Add Feed"
3. 粘贴URL并确认
4. 刷新feed，应该能看到视频列表

---

## 🔍 查看定时任务日志

### 实时查看Worker日志

```bash
wrangler tail --format pretty
```

### 查看定时任务执行历史

进入Cloudflare Dashboard:
1. 进入Workers & Pages
2. 选择 `b-cast-mvp`
3. 点击 "Logs" 标签
4. 查看定时任务执行记录

---

## ⏰ 定时任务说明

### 当前配置

- **执行时间**: 每天凌晨2点（UTC时间）
- **配置文件**: `backend/wrangler.toml`
- **配置项**: `[triggers] crons = ["0 2 * * *"]`

### 修改检查频率

编辑 `backend/wrangler.toml`:

```toml
# 每12小时检查一次
crons = ["0 2,14 * * *"]

# 每6小时检查一次
crons = ["0 */6 * * *"]

# 每天早上8点检查
crons = ["0 8 * * *"]
```

修改后需要重新部署：

```bash
pnpm run deploy
```

---

## 🐛 故障排查

### 问题1：数据库表不存在

**错误信息**: `no such table: subscriptions`

**解决方案**:
```bash
wrangler d1 execute b-cast-mvp --file=../scripts/subscriptions.sql
```

### 问题2：RSS文件404

**可能原因**: R2 Bucket配置错误

**解决方案**:
1. 检查 `wrangler.toml` 中的R2配置
2. 确认Bucket已创建: `wrangler r2 bucket list`
3. 重新添加订阅

### 问题3：定时任务未执行

**可能原因**: 
- Worker未部署
- Cron配置错误
- 所有订阅都被禁用

**解决方案**:
1. 确认部署: `wrangler deployments list`
2. 检查cron配置: `backend/wrangler.toml`
3. 查看订阅状态: `GET /api/subscriptions/list`
4. 手动测试: `wrangler dev --test-scheduled`

### 问题4：B站API解析失败

**错误信息**: `WBI签名失败` 或 `请求过于频繁`

**解决方案**:
- 减少定时任务频率
- 添加B站Cookie（参考 `docs/IMPLEMENT-COOKIE-SUPPORT.md`）
- 等待一段时间后重试

---

## 📊 数据流程图

```
用户添加B站URL
    ↓
解析B站API获取视频列表
    ↓
生成RSS XML并保存到R2
    ↓
保存订阅信息到D1数据库
    ↓
视频添加到下载队列
    ↓
【定时任务每天执行】
    ↓
检查订阅更新
    ↓
发现新视频
    ↓
更新RSS XML
    ↓
添加到下载队列
    ↓
GitHub Actions下载音频
    ↓
更新RSS XML（包含音频enclosure）
```

---

## 🎯 下一步

1. ✅ RSS订阅功能已完成
2. ⏳ 配置GitHub Actions下载Worker（参考 `scripts/download_worker.py`）
3. ⏳ 前端添加订阅管理界面
4. ⏳ 实现音频播放功能

---

## 📚 相关文档

- [RSS功能详细文档](./RSS-GUIDE.md)
- [API文档](./API.md)
- [部署文档](./DEPLOYMENT.md)
- [测试指南](./TESTING-GUIDE.md)

---

如有问题，请查看日志或提交Issue。
