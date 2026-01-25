# B-Cast MVP 部署指南

本文档详细说明如何从零开始部署B-Cast MVP版本。

## 📋 部署清单

- [ ] Cloudflare账户
- [ ] GitHub账户
- [ ] Node.js 18+
- [ ] wrangler CLI
- [ ] 约30分钟时间

## 🔧 第一步：Cloudflare配置

### 1.1 安装wrangler

```bash
npm install -g wrangler@latest

# 登录Cloudflare
wrangler login
```

### 1.2 创建D1数据库

```bash
cd backend
wrangler d1 create b-cast-mvp
```

**输出示例：**
```
✅ Successfully created DB 'b-cast-mvp'

[[d1_databases]]
binding = "DB"
database_name = "b-cast-mvp"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**重要：** 复制 `database_id`，填入 `backend/wrangler.toml`

### 1.3 初始化数据库

```bash
wrangler d1 execute b-cast-mvp --file=../scripts/download_queue.sql
```

**验证：**
```bash
wrangler d1 execute b-cast-mvp --command "SELECT name FROM sqlite_master WHERE type='table'"
```

应该看到 `download_queue` 表。

### 1.4 创建R2 Bucket

```bash
wrangler r2 bucket create b-cast-audio
```

### 1.5 配置R2公开访问（重要！）

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 左侧菜单选择 **R2**
3. 点击 `b-cast-audio` bucket
4. 点击 **Settings** 标签
5. 找到 **Public Access** 部分
6. 点击 **Allow Access** 按钮
7. 记录公开域名（格式：`pub-xxxxx.r2.dev`）

**注意：** 如果不配置公开访问，音频文件将无法播放！

### 1.6 获取R2 API凭证

1. Cloudflare Dashboard > R2 > **Manage R2 API Tokens**
2. 点击 **Create API Token**
3. 权限选择：**Admin Read & Write**
4. 点击 **Create API Token**
5. **重要：** 立即保存以下信息：
   - Access Key ID
   - Secret Access Key
   - R2 Endpoint（格式：`https://[account-id].r2.cloudflarestorage.com`）

### 1.7 创建Cloudflare API Token（用于GitHub Actions）

1. Dashboard右上角头像 > **My Profile**
2. 左侧菜单选择 **API Tokens**
3. 点击 **Create Token**
4. 选择 **Create Custom Token**
5. 配置权限：
   - **Account** > **D1** > **Edit**
6. 点击 **Continue to summary**
7. 点击 **Create Token**
8. 保存生成的Token

### 1.8 获取Account ID

在Cloudflare Dashboard任意页面的URL中找到，格式：
```
https://dash.cloudflare.com/[account-id]/...
```

## 🚀 第二步：部署后端

### 2.1 安装依赖

```bash
cd backend
npm install
```

### 2.2 测试本地运行

```bash
wrangler dev --local
```

访问 http://localhost:8787/health，应该看到：
```json
{"status":"ok","timestamp":1234567890}
```

### 2.3 部署到Cloudflare

```bash
wrangler deploy
```

**输出示例：**
```
✨  Compiled Worker successfully
🌍  Uploading...
✅  Deployed to https://b-cast-mvp.your-subdomain.workers.dev
```

**重要：** 记录这个URL！

### 2.4 测试API

```bash
curl https://b-cast-mvp.your-subdomain.workers.dev/health
```

## 🎨 第三步：配置前端

### 3.1 配置API地址

创建或编辑 `frontend/.env.production`：

```bash
VITE_API_BASE=https://b-cast-mvp.your-subdomain.workers.dev
```

### 3.2 安装依赖

```bash
cd frontend
npm install
```

### 3.3 测试本地运行

```bash
npm run dev
```

访问 http://localhost:5173

### 3.4 构建生产版本

```bash
npm run build
```

## 🔐 第四步：配置GitHub Secrets

### 4.1 前往仓库设置

GitHub仓库页面 > **Settings** > **Secrets and variables** > **Actions**

### 4.2 添加以下Secrets

点击 **New repository secret**，逐个添加：

| Secret名称 | 值 | 获取方式 |
|-----------|---|---------|
| `R2_ENDPOINT` | `https://[account-id].r2.cloudflarestorage.com` | 步骤1.6 |
| `R2_ACCESS_KEY` | (Access Key ID) | 步骤1.6 |
| `R2_SECRET_KEY` | (Secret Access Key) | 步骤1.6 |
| `R2_BUCKET` | `b-cast-audio` | 固定值 |
| `CLOUDFLARE_ACCOUNT_ID` | (Account ID) | 步骤1.8 |
| `D1_DATABASE_ID` | (Database ID) | 步骤1.2 |
| `CLOUDFLARE_API_TOKEN` | (API Token) | 步骤1.7 |

**验证：** 所有Secrets应该显示为已设置（绿色对勾）

## 📤 第五步：部署前端

你可以选择以下任一方式部署前端：

### 选项A：Cloudflare Pages（推荐）

```bash
cd frontend
wrangler pages deploy dist --project-name=b-cast
```

### 选项B：GitHub Pages

1. 在仓库中创建 `.github/workflows/deploy-frontend.yml`
2. 推送代码，自动部署

### 选项C：Vercel/Netlify

直接连接GitHub仓库，选择 `frontend` 目录。

## ✅ 第六步：测试完整流程

### 6.1 测试添加播放列表

1. 访问前端URL
2. 输入B站URL，例如：
   ```
   https://space.bilibili.com/3493085779869
   ```
3. 点击"添加"
4. 等待解析完成（约5秒）

### 6.2 测试下载功能

1. GitHub仓库 > **Actions** 标签页
2. 左侧选择 **Download Audio (MVP)**
3. 点击右侧 **Run workflow** 按钮
4. 点击绿色的 **Run workflow** 确认
5. 等待任务完成（1-5分钟，取决于队列长度）
6. 点击任务查看详细日志

### 6.3 验证下载结果

1. 刷新B-Cast前端页面
2. 展开播放列表
3. 查看下载状态是否变为"已下载"
4. 点击"测试播放"验证音频

### 6.4 检查R2存储

```bash
wrangler r2 object list b-cast-audio --prefix audio/
```

应该看到 `audio/BVxxxxxxx.m4a` 文件。

## 🐛 故障排查

### 问题1：API调用401错误

**原因：** wrangler.toml中database_id未填写

**解决：** 检查并填写正确的database_id

### 问题2：下载失败，GitHub Actions报错

**常见原因：**
- Secrets配置错误
- R2 API Token权限不足
- D1 API Token权限不足

**调试方法：**
```bash
# 验证D1连接
curl -X POST https://api.cloudflare.com/client/v4/accounts/[ACCOUNT_ID]/d1/database/[DB_ID]/query \
  -H "Authorization: Bearer [API_TOKEN]" \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT COUNT(*) FROM download_queue"}'
```

### 问题3：音频无法播放

**原因：** R2公开访问未配置

**解决：** 返回步骤1.5，配置R2公开访问

### 问题4：yt-dlp下载失败

**可能原因：**
- B站视频不存在
- B站API变化
- 网络问题

**调试：** 查看GitHub Actions日志中的详细错误信息

## 📊 监控和维护

### 查看Workers日志

```bash
wrangler tail
```

### 查看D1数据

```bash
# 查看队列状态
wrangler d1 execute b-cast-mvp --command \
  "SELECT status, COUNT(*) as count FROM download_queue GROUP BY status"

# 查看最近的错误
wrangler d1 execute b-cast-mvp --command \
  "SELECT bvid, error_message FROM download_queue WHERE status='failed' LIMIT 5"
```

### 清理失败的下载

```bash
wrangler d1 execute b-cast-mvp --command \
  "UPDATE download_queue SET status='pending', retry_count=0 WHERE status='failed'"
```

## 🔄 更新部署

### 更新后端

```bash
cd backend
git pull
wrangler deploy
```

### 更新前端

```bash
cd frontend
git pull
npm run build
# 根据你的部署方式重新部署
```

### 更新下载脚本

脚本更新后，下次GitHub Actions运行时自动使用新版本。

## 💰 成本控制

### 监控使用量

1. Cloudflare Dashboard
2. Analytics标签页
3. 查看Workers、D1、R2使用情况

### 设置预算提醒（可选）

Cloudflare Dashboard > Billing > Set up billing alerts

## 🎉 完成！

现在你已经成功部署了B-Cast MVP版本。

**下一步：**
- 添加更多播放列表
- 设置GitHub Actions定时任务
- 查看[完整功能路线图](../README.md#路线图)

如有问题，请查看[常见问题](../README.md#常见问题)或提交Issue。
