# 环境变量配置指南

## 📝 需要配置的环境变量

### Cloudflare Workers (wrangler.toml)

```toml
[vars]
WORKER_URL = "your-worker.workers.dev"  # 你的Worker URL
```

### Cloudflare Secrets (敏感信息)

使用 `wrangler secret` 命令添加：

```bash
cd backend

# GitHub集成 (可选，用于触发GitHub Action)
wrangler secret put GITHUB_TOKEN
# 输入你的GitHub Personal Access Token

wrangler secret put GITHUB_REPO  
# 输入格式: owner/repo (例如: catcherinsky/B-Cast)
```

### GitHub Secrets (用于GitHub Actions)

在GitHub仓库 Settings → Secrets and variables → Actions 中添加：

| Secret名称 | 说明 | 必需性 | 获取方法 |
|-----------|------|-------|---------|
| `WORKER_URL` | Worker部署地址 | ✅ 必需 | 部署后从Cloudflare获取 |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token | ✅ 必需 | Cloudflare Dashboard → My Profile → API Tokens |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare账户ID | ✅ 必需 | Cloudflare Dashboard → 侧边栏底部 |
| `R2_BUCKET_NAME` | R2存储桶名称 | ✅ 必需 | 默认: `b-cast-audio` |
| `BILIBILI_SESSDATA` | B站Cookie (用于下载受限视频) | ⚠️ 可选 | 见下文说明 |

## 🔑 如何获取各项配置

### 1. Cloudflare API Token

1. 访问 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 点击右上角头像 → My Profile → API Tokens
3. 点击 "Create Token"
4. 选择 "Edit Cloudflare Workers" 模板
5. 配置权限：
   - Account → Workers R2 Storage → Edit
   - Account → D1 → Edit
   - Zone → Workers Routes → Edit
6. 保存并复制Token

### 2. Cloudflare Account ID

1. 访问 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 在侧边栏底部找到 "Account ID"
3. 点击复制

### 3. Worker URL

```bash
# 部署后会显示
cd backend
pnpm run deploy

# 输出类似：
# Published b-cast-mvp
#   https://b-cast-mvp.your-subdomain.workers.dev
```

### 4. B站SESSDATA Cookie (可选)

**用途：** 下载需要登录才能观看的视频

**获取方法：**

1. 在浏览器中登录 [bilibili.com](https://www.bilibili.com)
2. 打开开发者工具 (F12)
3. 切换到 "Application" 或 "存储" 标签
4. 左侧选择 "Cookies" → "https://www.bilibili.com"
5. 找到名为 `SESSDATA` 的Cookie
6. 复制其值 (Value)

⚠️ **注意：**
- SESSDATA有效期约1个月
- 过期后需要重新获取
- 不要分享给他人（包含登录凭证）

### 5. GitHub Personal Access Token (可选)

**用途：** 通过Worker API触发GitHub Action

**获取方法：**

1. 访问 GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. 点击 "Generate new token (classic)"
3. 勾选权限：
   - `repo` (完整仓库权限)
   - 或仅勾选 `public_repo` (如果是公开仓库)
4. 生成并复制Token

**添加到Worker：**

```bash
cd backend
wrangler secret put GITHUB_TOKEN
# 粘贴你的Token

wrangler secret put GITHUB_REPO
# 输入: your-username/B-Cast
```

## 🚀 配置步骤

### 本地开发环境

本地开发不需要配置secrets，只需要：

```bash
cd backend
pnpm run dev
```

Wrangler会自动创建本地模拟环境。

### 生产环境部署

#### 步骤1: 更新 wrangler.toml

```toml
# backend/wrangler.toml
[vars]
WORKER_URL = "b-cast-mvp.your-subdomain.workers.dev"  # 替换为你的实际URL
```

#### 步骤2: 添加Cloudflare Secrets (可选)

```bash
cd backend

# 如果需要通过API触发GitHub Action
wrangler secret put GITHUB_TOKEN
wrangler secret put GITHUB_REPO
```

#### 步骤3: 部署

```bash
pnpm run deploy
```

#### 步骤4: 配置GitHub Secrets

在GitHub仓库添加以下Secrets：

```
WORKER_URL=https://b-cast-mvp.your-subdomain.workers.dev
CLOUDFLARE_API_TOKEN=your-api-token
CLOUDFLARE_ACCOUNT_ID=your-account-id
R2_BUCKET_NAME=b-cast-audio
BILIBILI_SESSDATA=your-sessdata (可选)
```

## 🔒 安全最佳实践

### ✅ 应该做的：

1. ✅ 使用最小权限原则创建API Token
2. ✅ 定期轮换敏感Token
3. ✅ 不要将Secrets提交到Git
4. ✅ 使用Cloudflare Secrets存储敏感信息
5. ✅ 定期检查GitHub Actions日志，确保没有泄露敏感信息

### ❌ 不应该做的：

1. ❌ 不要在代码中硬编码Token
2. ❌ 不要在wrangler.toml中写入敏感信息
3. ❌ 不要分享你的SESSDATA Cookie
4. ❌ 不要在公开日志中打印Token

## 🧪 验证配置

### 验证Cloudflare连接

```bash
cd backend
wrangler whoami  # 查看当前登录状态
wrangler deploy  # 尝试部署
```

### 验证GitHub Secrets

1. 访问 `https://github.com/your-username/B-Cast/actions`
2. 手动触发 "Download Audio from Bilibili" workflow
3. 查看日志，确保没有报错

### 验证Worker API

```bash
# 检查健康状态
curl https://your-worker.workers.dev/health

# 测试获取待下载列表
curl https://your-worker.workers.dev/api/downloads/pending
```

## 📚 相关文档

- [wrangler.toml配置](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Cloudflare Secrets管理](https://developers.cloudflare.com/workers/configuration/secrets/)
- [GitHub Secrets文档](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
