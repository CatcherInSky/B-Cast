# B-Cast MVP 部署清单

> 快速部署指南，按顺序执行即可

---

## ✅ 前置准备

- [ ] 注册Cloudflare账号
- [ ] 安装Node.js (v18+)
- [ ] 安装wrangler: `npm install -g wrangler`
- [ ] GitHub账号

---

## 📝 Step 1: Cloudflare配置

### 1.1 登录Cloudflare

```bash
wrangler login
```

### 1.2 创建D1数据库

```bash
# 创建数据库
wrangler d1 create b-cast-mvp

# 📋 复制输出中的 database_id
# 示例: database_id = "abc123-def456-ghi789"
```

**记录信息：**
```
D1_DATABASE_ID = _________________
```

### 1.3 初始化D1表结构

```bash
# 在项目根目录执行
wrangler d1 execute b-cast-mvp --file=./scripts/download_queue.sql
```

### 1.4 创建R2存储桶

```bash
wrangler r2 bucket create b-cast-audio
```

### 1.5 配置R2公开访问（重要！）

1. 访问 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 进入 R2 > b-cast-audio
3. 点击 Settings 标签
4. 找到 "Public Access" 部分
5. 点击 "Allow Access"
6. 复制公开域名（格式：`pub-xxx.r2.dev`）

**记录信息：**
```
R2_PUBLIC_DOMAIN = _________________
```

### 1.6 创建R2 API Token

1. 进入 R2 > Manage R2 API Tokens
2. 点击 "Create API Token"
3. Token Name: `b-cast-mvp-token`
4. Permissions: 选择 "Admin Read & Write"
5. TTL: 选择 "Forever"
6. 点击 "Create API Token"
7. 复制 Access Key ID 和 Secret Access Key

**记录信息：**
```
R2_ACCESS_KEY = _________________
R2_SECRET_KEY = _________________
```

### 1.7 获取Account ID

1. 在Dashboard任意页面，查看URL
2. URL格式：`https://dash.cloudflare.com/{account_id}/...`
3. 复制account_id

**记录信息：**
```
CLOUDFLARE_ACCOUNT_ID = _________________
```

### 1.8 创建API Token（用于D1访问）

1. 进入 Profile > API Tokens
2. 点击 "Create Token"
3. 使用模板 "Edit Cloudflare Workers"
4. 或自定义权限：
   - Account > D1 > Edit
   - Account > Workers Scripts > Edit
5. 创建后复制Token

**记录信息：**
```
CLOUDFLARE_API_TOKEN = _________________
```

### 1.9 获取R2 Endpoint

格式：`https://{account_id}.r2.cloudflarestorage.com`

**记录信息：**
```
R2_ENDPOINT = https://_________________.r2.cloudflarestorage.com
```

---

## 🔧 Step 2: 配置后端

### 2.1 更新 wrangler.toml

编辑 `backend/wrangler.toml`:

```toml
name = "b-cast-mvp"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "b-cast-mvp"
database_id = "填入你的D1_DATABASE_ID"

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "b-cast-audio"
```

### 2.2 安装依赖

```bash
cd backend
npm install
```

### 2.3 测试本地运行

```bash
wrangler dev --local
```

访问 http://localhost:8787/health 应该返回：
```json
{"status":"ok","timestamp":1234567890}
```

### 2.4 部署到Cloudflare

```bash
wrangler deploy
```

**记录信息：**
```
WORKER_URL = _________________
# 示例: https://b-cast-mvp.your-subdomain.workers.dev
```

---

## 🎨 Step 3: 配置前端

### 3.1 创建环境变量文件

```bash
cd frontend

# 开发环境
cat > .env.development << EOF
VITE_API_BASE=http://localhost:8787
EOF

# 生产环境（使用Step 2.4中记录的WORKER_URL）
cat > .env.production << EOF
VITE_API_BASE=填入你的WORKER_URL
EOF
```

### 3.2 安装依赖

```bash
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

### 3.5 部署前端

**选项A: Cloudflare Pages（推荐）**

```bash
# 安装wrangler pages插件
wrangler pages deploy dist --project-name=b-cast-mvp
```

**选项B: GitHub Pages**

```bash
# 配置GitHub Pages（见前端package.json中的deploy脚本）
npm run deploy
```

**记录信息：**
```
FRONTEND_URL = _________________
```

---

## 🤖 Step 4: 配置GitHub Actions

### 4.1 添加GitHub Secrets

前往 GitHub仓库 > Settings > Secrets and variables > Actions

点击 "New repository secret"，依次添加以下Secrets：

| Name | Value |
|------|-------|
| `R2_ENDPOINT` | 从Step 1.9复制 |
| `R2_ACCESS_KEY` | 从Step 1.6复制 |
| `R2_SECRET_KEY` | 从Step 1.6复制 |
| `R2_BUCKET` | `b-cast-audio` |
| `CLOUDFLARE_ACCOUNT_ID` | 从Step 1.7复制 |
| `D1_DATABASE_ID` | 从Step 1.2复制 |
| `CLOUDFLARE_API_TOKEN` | 从Step 1.8复制 |

### 4.2 验证Secrets

- [ ] 共添加7个Secrets
- [ ] 所有值都已正确填入
- [ ] 没有多余的空格或换行

---

## 🧪 Step 5: 端到端测试

### 5.1 测试B站解析

```bash
# 替换YOUR_WORKER_URL为实际地址
curl -X POST https://YOUR_WORKER_URL/api/bilibili/parse \
  -H "Content-Type: application/json" \
  -d '{"url":"https://space.bilibili.com/3493085779869"}' \
  | jq
```

预期输出包含 `"success": true` 和播放列表数据。

### 5.2 在前端添加播放列表

1. 访问前端URL
2. 输入测试URL: `https://space.bilibili.com/3493085779869`
3. 点击"添加"
4. 验证播放列表是否显示

### 5.3 触发下载任务

1. 前往 GitHub仓库 > Actions
2. 选择 "Download Audio (MVP)" workflow
3. 点击 "Run workflow" 下拉菜单
4. 点击绿色的 "Run workflow" 按钮
5. 等待任务完成（约5-10分钟）
6. 点击任务查看日志，确认下载成功

### 5.4 验证下载结果

1. 在前端点击 "下载状态" 页面（或访问 `/downloads`）
2. 点击"刷新"按钮
3. 查看状态是否从 `pending` 变为 `downloaded`
4. 回到首页，展开播放列表
5. 点击"测试播放"按钮
6. 验证音频是否正常播放

### 5.5 检查R2存储

```bash
# 列出R2中的文件
wrangler r2 object list b-cast-audio --prefix audio/

# 应该看到类似输出：
# audio/BV1xx4y1x7xx.m4a
```

---

## ✅ 完成检查清单

- [ ] Cloudflare D1数据库已创建并初始化
- [ ] Cloudflare R2存储桶已创建并配置公开访问
- [ ] 后端已部署到Cloudflare Workers
- [ ] 前端已部署到Cloudflare Pages或GitHub Pages
- [ ] GitHub Actions所有Secrets已配置
- [ ] B站URL解析测试通过
- [ ] 下载任务执行成功
- [ ] 音频可以正常播放

---

## 🐛 常见问题

### Q1: D1数据库初始化失败

```bash
# 检查数据库是否存在
wrangler d1 list

# 重新执行初始化
wrangler d1 execute b-cast-mvp --file=./scripts/download_queue.sql
```

### Q2: 后端部署失败

```bash
# 检查wrangler.toml配置
# 确保database_id正确

# 查看详细错误
wrangler deploy --verbose
```

### Q3: GitHub Actions下载失败

1. 检查Secrets是否正确配置
2. 查看Actions日志中的详细错误信息
3. 常见问题：
   - R2_ENDPOINT格式错误（应该包含 https://）
   - API Token权限不足（需要D1 Edit权限）
   - yt-dlp无法访问B站（尝试使用VPN）

### Q4: R2音频无法访问

1. 确认R2公开访问已开启
2. 检查audio_url格式（应该是 `https://pub-xxx.r2.dev/audio/BVxxx.m4a`）
3. 手动访问audio_url测试

### Q5: 前端无法连接后端

1. 检查 `.env.production` 中的 `VITE_API_BASE`
2. 确认后端CORS已启用
3. 查看浏览器Console错误信息

---

## 📊 调试命令

```bash
# 查看D1数据
wrangler d1 execute b-cast-mvp --command "SELECT * FROM download_queue LIMIT 5"

# 查看R2文件
wrangler r2 object list b-cast-audio

# 下载R2文件测试
wrangler r2 object get b-cast-audio/audio/BVxxx.m4a --file test.m4a

# 实时查看Workers日志
wrangler tail

# 删除所有下载记录（重置）
wrangler d1 execute b-cast-mvp --command "DELETE FROM download_queue"
```

---

## 📖 相关文档

- [MVP设计文档](./mvp-design.md) - 详细的技术设计
- [技术设计文档](./technical-design.md) - 完整版功能设计
- [Cloudflare Workers文档](https://developers.cloudflare.com/workers/)
- [Cloudflare D1文档](https://developers.cloudflare.com/d1/)
- [Cloudflare R2文档](https://developers.cloudflare.com/r2/)

---

## 🎉 下一步

完成MVP后，可以考虑：

1. **添加更多播放列表** - 测试不同类型的B站URL
2. **优化下载逻辑** - 添加重试机制、并发下载
3. **改进前端UI** - 更美观的界面设计
4. **添加认证** - 参考完整版设计文档
5. **自动化任务** - 配置定时触发下载

---

**文档版本：** v1.0  
**最后更新：** 2026-01-23  
**预计部署时间：** 30-60分钟
