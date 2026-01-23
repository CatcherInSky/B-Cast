# B-Cast 部署配置清单

> 完整的部署配置步骤和检查清单

---

## 📋 总览

部署B-Cast需要配置以下服务：
- ✅ Cloudflare账号（Workers + D1 + R2）
- ✅ GitHub账号（仓库 + Actions）
- ✅ 本地开发环境（Node.js + Wrangler CLI）

---

## 1️⃣ 前置准备

### 1.1 安装必需工具

```bash
# Node.js (18+)
node --version  # 确认已安装

# Wrangler CLI (Cloudflare命令行工具)
npm install -g wrangler

# 验证安装
wrangler --version
```

### 1.2 创建账号

- [ ] Cloudflare账号: https://dash.cloudflare.com/sign-up
- [ ] GitHub账号: https://github.com/signup
- [ ] 记录Cloudflare Account ID（Dashboard右侧边栏）

---

## 2️⃣ Cloudflare 配置

### 2.1 登录 Cloudflare

```bash
wrangler login
# 会打开浏览器，授权后自动完成登录
```

### 2.2 创建 D1 数据库

```bash
# 创建数据库
wrangler d1 create b-cast-db

# 输出示例：
# ✅ Successfully created DB 'b-cast-db'!
# 
# [[d1_databases]]
# binding = "DB"
# database_name = "b-cast-db"
# database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# ⚠️ 重要：记录 database_id
```

**记录以下信息：**
```
D1_DATABASE_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### 2.3 初始化数据库

```bash
# 执行schema.sql创建表结构
wrangler d1 execute b-cast-db --file=./schema.sql

# 验证表是否创建成功
wrangler d1 execute b-cast-db --command="SELECT name FROM sqlite_master WHERE type='table'"
```

**应该看到：**
```
download_queue
download_stats
```

### 2.4 创建 R2 Bucket

```bash
# 创建存储桶
wrangler r2 bucket create b-cast-audio

# 验证创建成功
wrangler r2 bucket list
```

### 2.5 配置 R2 访问密钥

#### 方法1：通过Dashboard（推荐）

1. 访问 https://dash.cloudflare.com
2. 进入 R2 → Manage R2 API Tokens
3. 点击 "Create API Token"
4. 配置：
   - Token Name: `b-cast-r2-access`
   - Permissions: `Object Read & Write`
   - TTL: `Forever`
   - Bucket: `b-cast-audio` (或选择All buckets)
5. 点击 "Create API Token"

**记录以下信息：**
```
R2_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxx
R2_SECRET_KEY=yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy
R2_ENDPOINT=https://[account-id].r2.cloudflarestorage.com
R2_BUCKET=b-cast-audio
```

⚠️ **重要：** `R2_SECRET_KEY` 只显示一次，务必保存！

#### 方法2：通过Wrangler

```bash
# 查看Account ID
wrangler whoami

# R2 Endpoint格式
# https://[account-id].r2.cloudflarestorage.com
```

### 2.6 创建 Cloudflare API Token（给GitHub Actions用）

1. 访问 https://dash.cloudflare.com/profile/api-tokens
2. 点击 "Create Token"
3. 选择 "Create Custom Token"
4. 配置：
   - Token name: `b-cast-github-actions`
   - Permissions:
     - Account | D1 | Edit
     - Account | R2 | Edit (可选，如果Workers需要管理R2)
   - Account Resources: 选择你的账号
   - TTL: Forever
5. 点击 "Continue to summary" → "Create Token"

**记录以下信息：**
```
CLOUDFLARE_API_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 2.7 配置 Workers Secrets

```bash
# 1. 生成访问Token（用于前端登录）
openssl rand -base64 32
# 输出示例: Kx7vJ9mN2pQ5wR8tY3uI6oL1aS4dF7gH9jK0lZ2xC5vB8nM1qW4e

# 保存到Workers
wrangler secret put AUTH_TOKEN
# 粘贴上面生成的token

# 2. GitHub Personal Access Token（用于触发Actions）
# 稍后在GitHub中生成，这里先记录命令
wrangler secret put GITHUB_TOKEN
# 粘贴GitHub PAT

# 3. GitHub仓库名
wrangler secret put GITHUB_REPO
# 格式: username/repo-name
# 例如: your-name/b-cast
```

### 2.8 更新 wrangler.toml

```toml
# backend/wrangler.toml
name = "b-cast-api"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "b-cast-db"
database_id = "YOUR_DATABASE_ID_HERE"  # ← 替换为实际的database_id

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "b-cast-audio"

[triggers]
crons = ["0 2 * * *"]  # 每天凌晨2点
```

---

## 3️⃣ GitHub 配置

### 3.1 Fork 或创建仓库

```bash
# 如果是新项目
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/b-cast.git
git push -u origin main
```

### 3.2 生成 GitHub Personal Access Token

1. 访问 https://github.com/settings/tokens
2. 点击 "Generate new token (classic)"
3. 配置：
   - Note: `b-cast-actions`
   - Expiration: `No expiration` (或选择90天后手动更新)
   - Scopes: 
     - ✅ `repo` (Full control of private repositories)
     - ✅ `workflow` (Update GitHub Action workflows)
4. 点击 "Generate token"

**记录以下信息：**
```
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

⚠️ **重要：** Token只显示一次，务必保存！

### 3.3 配置到 Cloudflare Workers

```bash
# 回到之前的步骤
wrangler secret put GITHUB_TOKEN
# 粘贴上面的GitHub PAT

wrangler secret put GITHUB_REPO
# 输入: your-username/b-cast
```

### 3.4 配置 GitHub Secrets

访问仓库 Settings → Secrets and variables → Actions → New repository secret

添加以下Secrets：

#### R2 相关（4个）

```
Name: R2_ENDPOINT
Value: https://[your-account-id].r2.cloudflarestorage.com

Name: R2_ACCESS_KEY
Value: xxxxxxxxxxxxxxxxxxxx

Name: R2_SECRET_KEY
Value: yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy

Name: R2_BUCKET
Value: b-cast-audio
```

#### Cloudflare 相关（2个）

```
Name: CLOUDFLARE_ACCOUNT_ID
Value: your-account-id (32位hex)

Name: CLOUDFLARE_API_TOKEN
Value: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### D1 相关（1个）

```
Name: D1_DATABASE_ID
Value: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### 3.5 验证配置

访问仓库 Settings → Secrets and variables → Actions

**应该看到7个Secrets：**
- [x] R2_ENDPOINT
- [x] R2_ACCESS_KEY
- [x] R2_SECRET_KEY
- [x] R2_BUCKET
- [x] CLOUDFLARE_ACCOUNT_ID
- [x] CLOUDFLARE_API_TOKEN
- [x] D1_DATABASE_ID

---

## 4️⃣ 本地开发环境配置

### 4.1 前端环境变量

```bash
# frontend/.env.local
VITE_API_URL=http://localhost:8787
```

### 4.2 后端本地配置

```bash
# backend/.dev.vars
AUTH_TOKEN=your-local-dev-token
GITHUB_TOKEN=your-github-token
GITHUB_REPO=your-username/b-cast
```

⚠️ **注意：** `.dev.vars` 不要提交到git！已在 `.gitignore` 中

### 4.3 验证本地环境

```bash
# 前端
cd frontend
npm install
npm run dev
# 应该在 http://localhost:5173 启动

# 后端
cd backend
npm install
wrangler dev
# 应该在 http://localhost:8787 启动
```

---

## 5️⃣ 部署验证

### 5.1 部署前端

```bash
cd frontend
npm run build

# 部署到GitHub Pages
npm run deploy
# 或手动配置GitHub Pages指向gh-pages分支
```

### 5.2 部署后端

```bash
cd backend
wrangler deploy

# 应该看到类似输出：
# ✨ Built successfully!
# ✨ Successfully published to https://b-cast-api.your-subdomain.workers.dev
```

### 5.3 测试 API

```bash
# 测试登录接口
curl -X POST https://your-api.workers.dev/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"token":"your-auth-token"}'

# 应该返回：
# {"success":true,"token":"your-auth-token"}
```

### 5.4 手动触发下载任务

访问仓库 Actions → Download Audio → Run workflow

或通过API触发：
```bash
curl -X POST \
  https://api.github.com/repos/YOUR_USERNAME/b-cast/dispatches \
  -H "Authorization: Bearer YOUR_GITHUB_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"event_type":"download-audio"}'
```

---

## 6️⃣ 配置清单总结

### ✅ Cloudflare Workers Secrets (3个)

| Secret | 获取方式 | 用途 |
|--------|---------|------|
| AUTH_TOKEN | `openssl rand -base64 32` | 前端登录验证 |
| GITHUB_TOKEN | GitHub Settings → Tokens | 触发Actions |
| GITHUB_REPO | 手动输入 | 仓库标识 |

### ✅ GitHub Secrets (7个)

| Secret | 获取方式 | 用途 |
|--------|---------|------|
| R2_ENDPOINT | Cloudflare Dashboard | R2连接地址 |
| R2_ACCESS_KEY | Cloudflare R2 API Token | S3认证 |
| R2_SECRET_KEY | Cloudflare R2 API Token | S3认证 |
| R2_BUCKET | 创建时指定 | 存储桶名称 |
| CLOUDFLARE_ACCOUNT_ID | Dashboard右侧边栏 | 账号标识 |
| CLOUDFLARE_API_TOKEN | API Tokens页面 | D1访问权限 |
| D1_DATABASE_ID | wrangler d1 create输出 | 数据库标识 |

### ✅ wrangler.toml 配置

- [x] `database_id` - 替换为实际的D1数据库ID
- [x] `bucket_name` - 确认R2存储桶名称
- [x] `crons` - 配置定时任务时间

---

## 7️⃣ 常见问题

### Q1: 忘记了某个Secret的值怎么办？

**A:** 
- GitHub Secrets: 无法查看，只能重新生成并更新
- Cloudflare Secrets: `wrangler secret delete SECRET_NAME` 然后重新设置
- R2 Keys: 重新生成新的API Token

### Q2: 如何验证配置是否正确？

**A:** 运行以下命令：
```bash
# 验证D1
wrangler d1 execute b-cast-db --command="SELECT * FROM download_queue LIMIT 1"

# 验证R2
wrangler r2 object list b-cast-audio

# 验证Workers部署
wrangler deployments list
```

### Q3: GitHub Actions执行失败

**A:** 检查Actions日志，常见问题：
- Secrets配置错误或缺失
- D1_DATABASE_ID不正确
- R2_ACCESS_KEY过期或无权限
- Python依赖安装失败

### Q4: Workers部署后无法访问

**A:** 检查：
- wrangler.toml中的database_id是否正确
- R2 bucket是否存在
- Secrets是否都已设置：`wrangler secret list`

---

## 8️⃣ 安全建议

### 🔒 保护你的Secrets

- ❌ **永远不要**把Secrets提交到Git
- ❌ **永远不要**在代码中硬编码Secrets
- ✅ 使用 `.env.local` 和 `.dev.vars` 存储本地开发配置
- ✅ 确保 `.gitignore` 包含敏感文件

### 🔐 定期轮换

建议每3-6个月轮换一次：
- AUTH_TOKEN
- GITHUB_TOKEN
- R2 API Keys
- Cloudflare API Token

### 📝 备份重要信息

将以下信息安全保存（如密码管理器）：
- AUTH_TOKEN（用于登录应用）
- R2_ACCESS_KEY / R2_SECRET_KEY
- CLOUDFLARE_API_TOKEN
- GITHUB_TOKEN

---

## 9️⃣ 快速开始脚本

### 一键配置脚本（可选）

```bash
#!/bin/bash
# setup.sh - 快速配置脚本

echo "🚀 B-Cast 配置向导"
echo ""

# 1. 登录Cloudflare
echo "📍 步骤 1/5: 登录 Cloudflare"
wrangler login

# 2. 创建D1
echo "📍 步骤 2/5: 创建 D1 数据库"
wrangler d1 create b-cast-db

# 3. 创建R2
echo "📍 步骤 3/5: 创建 R2 存储桶"
wrangler r2 bucket create b-cast-audio

# 4. 生成Token
echo "📍 步骤 4/5: 生成 AUTH_TOKEN"
AUTH_TOKEN=$(openssl rand -base64 32)
echo "AUTH_TOKEN: $AUTH_TOKEN"
echo "请保存此Token，用于登录应用"

# 5. 初始化数据库
echo "📍 步骤 5/5: 初始化数据库"
wrangler d1 execute b-cast-db --file=./schema.sql

echo ""
echo "✅ 基础配置完成！"
echo ""
echo "⚠️  接下来需要手动配置："
echo "1. 在Cloudflare Dashboard创建R2 API Token"
echo "2. 在GitHub创建Personal Access Token"
echo "3. 配置GitHub Secrets（7个）"
echo "4. 更新 wrangler.toml 中的 database_id"
echo ""
echo "📖 详细步骤请参考: docs/deployment-checklist.md"
```

---

## 🎯 快速检查清单

部署前最后检查：

### Cloudflare
- [ ] 已登录 wrangler
- [ ] D1 数据库已创建
- [ ] D1 schema已执行
- [ ] R2 bucket已创建
- [ ] R2 API Token已创建
- [ ] Cloudflare API Token已创建
- [ ] Workers Secrets已配置（3个）
- [ ] wrangler.toml已更新

### GitHub
- [ ] 仓库已创建/Fork
- [ ] GitHub PAT已创建
- [ ] GitHub Secrets已配置（7个）
- [ ] Workflow文件存在

### 测试
- [ ] 本地前端能启动
- [ ] 本地后端能启动
- [ ] API能正常响应
- [ ] D1能正常查询
- [ ] R2能正常访问

**全部勾选后，即可开始使用！** 🎉

---

**文档版本：** v1.0  
**最后更新：** 2026-01-23
