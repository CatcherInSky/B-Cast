# Cloudflare 自动化部署指南

> 多种自动化部署方案，让部署更简单

---

## 🎯 概述

Cloudflare支持多种自动化部署方式：

| 方案 | 触发方式 | 适用场景 |
|------|---------|---------|
| **npm scripts** | 手动执行 | 本地开发部署 |
| **wrangler.toml build命令** | 自动执行 | 每次部署前自动构建 |
| **GitHub Actions** | Git push | CI/CD自动化 |
| **一键部署脚本** | 手动执行 | 完整自动化流程 |

---

## 🚀 方案1: npm scripts（最简单）

### 使用方法

```bash
# 一键部署（推荐）
npm run deploy

# 或分别部署
npm run deploy:backend   # 仅后端
npm run deploy:frontend  # 仅前端
```

### 配置说明

已在 `package.json` 中配置：

```json
{
  "scripts": {
    "init": "node scripts/init-cloudflare.js",
    "check-env": "node scripts/check-deployment.js",
    "deploy": "node scripts/deploy.js",
    "deploy:backend": "cd backend && wrangler deploy",
    "deploy:frontend": "cd frontend && npm run build && wrangler pages deploy dist"
  }
}
```

### 执行流程

```
npm run deploy
    ↓
1. 检查wrangler CLI
    ↓
2. 检查登录状态
    ↓
3. 运行部署前检查 (check-deployment.js)
    ↓
4. 部署后端 (Workers)
    ↓
5. 自动更新前端环境变量
    ↓
6. 构建前端
    ↓
7. 部署前端 (Pages)
    ↓
✅ 完成！
```

---

## ⚙️ 方案2: wrangler.toml 构建命令

### 配置

在 `backend/wrangler.toml` 中已配置：

```toml
[build]
command = "npm run build"
```

### 工作原理

每次执行 `wrangler deploy` 时，会自动：
1. 执行 `npm run build`
2. 编译TypeScript
3. 打包代码
4. 部署到Cloudflare

### 使用

```bash
cd backend
wrangler deploy
# 自动执行构建命令
```

### 自定义构建命令

可以配置更复杂的构建流程：

```toml
[build]
command = "npm run build && npm run test && npm run lint"
```

---

## 🤖 方案3: GitHub Actions自动部署

### 配置文件

已创建 `.github/workflows/deploy.yml`：

```yaml
name: Deploy to Cloudflare

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy-backend:
    # 部署后端到Workers
    
  deploy-frontend:
    # 构建并部署前端到Pages
```

### 触发条件

1. **自动触发**: 推送到 `main` 分支
   ```bash
   git push origin main
   # → 自动部署
   ```

2. **手动触发**: 在GitHub Actions界面点击"Run workflow"

### 所需Secrets

在GitHub仓库配置以下Secrets：

```
Settings > Secrets and variables > Actions
```

添加：
- `CLOUDFLARE_API_TOKEN` - Cloudflare API Token
- `CLOUDFLARE_ACCOUNT_ID` - Account ID
- `VITE_API_BASE` - Worker URL（可选）

### 工作流程

```
Git Push
    ↓
GitHub Actions触发
    ↓
1. Checkout代码
    ↓
2. 安装依赖
    ↓
3. 运行检查
    ↓
4. 部署后端
    ↓
5. 构建前端
    ↓
6. 部署前端
    ↓
✅ 部署完成
    ↓
通知（可选）
```

---

## 🎨 方案4: 一键部署脚本

### 使用方法

**Node.js版本（跨平台，推荐）：**
```bash
npm run deploy
```

**Bash版本（Unix系统）：**
```bash
npm run deploy:bash
# 或
bash scripts/deploy.sh
```

### 脚本功能

1. ✅ 环境检查
   - 检查wrangler CLI
   - 检查Node.js
   - 检查登录状态

2. ✅ 部署前检查
   - 验证wrangler.toml配置
   - 检查环境变量
   - 确认database_id

3. ✅ 后端部署
   - 自动安装依赖
   - 执行wrangler deploy
   - 获取Worker URL

4. ✅ 前端配置
   - 自动更新.env.production
   - 填入Worker URL

5. ✅ 前端部署
   - 构建React应用
   - 部署到Cloudflare Pages

### 交互式流程

```bash
$ npm run deploy

🚀 B-Cast 一键部署
================================

📝 检查必需工具...
✅ wrangler 已安装
✅ Node.js 已安装

🔐 检查Cloudflare登录状态...
✅ 已登录Cloudflare

🔍 运行部署前检查...
✅ database_id 已配置
✅ 前端环境变量已配置

是否继续部署？(y/n) y

📦 部署后端 (Cloudflare Workers)...
   执行部署...
✅ 后端部署成功
   Worker URL: https://b-cast-mvp.xxx.workers.dev

🎨 部署前端 (Cloudflare Pages)...
   构建前端...
✅ 前端构建成功
   部署到Cloudflare Pages...
✅ 前端部署成功

================================
🎉 部署完成！
```

---

## 🔍 部署前检查脚本

### 自动检查项

`scripts/check-deployment.js` 会自动检查：

1. **wrangler.toml配置**
   ```javascript
   ❌ database_id 未配置
   → 解决: npm run init
   ```

2. **前端环境变量**
   ```javascript
   ⚠️  .env.production 不存在
   → 提示: 需要配置VITE_API_BASE
   ```

### 手动运行检查

```bash
npm run check-env
```

---

## 📋 部署流程对比

### 传统手动部署

```bash
# 1. 登录
wrangler login

# 2. 部署后端
cd backend
npm install
wrangler deploy
# 记录Worker URL

# 3. 配置前端
cd ../frontend
echo "VITE_API_BASE=<Worker URL>" > .env.production

# 4. 部署前端
npm install
npm run build
wrangler pages deploy dist --project-name=b-cast-mvp

# 总耗时: ~10分钟
```

### 自动化部署

```bash
# 1. 初始化（首次）
npm run init

# 2. 部署
npm run deploy

# 总耗时: ~2分钟
```

### GitHub Actions自动部署

```bash
# 1. 配置Secrets（首次）
# 2. 推送代码
git push origin main

# 自动部署，无需人工介入
# 总耗时: ~3分钟（自动）
```

---

## 🛠️ 高级配置

### 1. 多环境部署

创建不同的配置文件：

```bash
backend/
  ├── wrangler.toml           # 生产环境
  ├── wrangler.dev.toml       # 开发环境
  └── wrangler.staging.toml   # 预览环境
```

部署命令：

```bash
# 开发环境
wrangler deploy --config wrangler.dev.toml

# 预览环境
wrangler deploy --config wrangler.staging.toml

# 生产环境
wrangler deploy
```

### 2. 自定义构建流程

在 `backend/package.json` 中：

```json
{
  "scripts": {
    "prebuild": "npm run lint && npm run test",
    "build": "tsc",
    "postbuild": "npm run bundle",
    "predeploy": "npm run check-env",
    "deploy": "wrangler deploy",
    "postdeploy": "npm run notify"
  }
}
```

### 3. 部署通知

添加部署成功通知：

```javascript
// scripts/notify-deploy.js
async function notify() {
  // 发送到Slack、Discord、Email等
  await fetch(WEBHOOK_URL, {
    method: 'POST',
    body: JSON.stringify({
      text: '🎉 B-Cast 部署成功！'
    })
  });
}
```

在 `package.json` 中：

```json
{
  "scripts": {
    "postdeploy": "node scripts/notify-deploy.js"
  }
}
```

---

## 🔄 CI/CD最佳实践

### 1. 分支策略

```
main (生产环境)
  ↑ PR merge
develop (开发环境)
  ↑ PR merge
feature/* (功能分支)
```

### 2. GitHub Actions配置

```yaml
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    # 运行测试
  
  deploy-dev:
    if: github.ref == 'refs/heads/develop'
    # 部署到开发环境
  
  deploy-prod:
    if: github.ref == 'refs/heads/main'
    # 部署到生产环境
```

### 3. 环境变量管理

使用GitHub Environments：

```yaml
jobs:
  deploy-prod:
    environment: production
    # 使用production环境的Secrets
```

---

## 🐛 故障排查

### 问题1: wrangler未登录

```bash
❌ 未登录Cloudflare
```

**解决：**
```bash
wrangler login
```

### 问题2: database_id未配置

```bash
❌ database_id 未配置
```

**解决：**
```bash
npm run init
```

### 问题3: 前端环境变量错误

```bash
⚠️  .env.production 使用的是示例配置
```

**解决：**
```bash
# 自动解决（部署脚本会自动更新）
npm run deploy

# 或手动更新
echo "VITE_API_BASE=https://your-worker.workers.dev" > frontend/.env.production
```

### 问题4: GitHub Actions失败

**检查：**
1. Secrets是否正确配置
2. API Token是否有足够权限
3. 查看Actions日志

---

## 📊 性能优化

### 1. 缓存依赖

在GitHub Actions中：

```yaml
- uses: actions/setup-node@v4
  with:
    cache: 'npm'
    cache-dependency-path: backend/package-lock.json
```

### 2. 并行部署

```yaml
jobs:
  deploy-backend:
    # 后端部署
  
  deploy-frontend:
    needs: deploy-backend  # 等待后端完成
    # 前端部署
```

### 3. 增量构建

使用Cloudflare的增量部署功能，只更新变化的文件。

---

## 🎉 总结

### 推荐方案

| 场景 | 推荐方案 | 命令 |
|------|---------|------|
| 本地开发 | npm scripts | `npm run deploy` |
| 团队协作 | GitHub Actions | `git push` |
| 快速测试 | 一键脚本 | `npm run deploy` |
| 生产环境 | GitHub Actions + 多环境 | `git push main` |

### 快速开始

```bash
# 1. 初始化（首次）
npm run init

# 2. 部署
npm run deploy

# 3. 自动化（可选）
# 配置GitHub Actions Secrets
# 推送代码即可自动部署
```

就是这么简单！🚀

---

**文档版本：** v1.0  
**最后更新：** 2026-01-23
