# B-Cast MVP 环境变量配置指南

> 所有需要配置的环境变量和Secrets的完整说明

---

## 📋 配置清单

### 1. Cloudflare Secrets

这些需要通过Cloudflare Dashboard或wrangler配置：

| 变量名 | 获取方式 | 用途 |
|--------|---------|------|
| `CLOUDFLARE_ACCOUNT_ID` | Dashboard URL中 | Worker和D1访问 |
| `D1_DATABASE_ID` | `wrangler d1 create`输出 | 数据库连接 |
| `CLOUDFLARE_API_TOKEN` | Profile > API Tokens | D1 API访问 |

### 2. R2配置

| 变量名 | 获取方式 | 用途 |
|--------|---------|------|
| `R2_ENDPOINT` | `https://{account_id}.r2.cloudflarestorage.com` | R2连接 |
| `R2_ACCESS_KEY` | R2 > API Tokens | S3兼容访问 |
| `R2_SECRET_KEY` | R2 > API Tokens | S3兼容密钥 |
| `R2_BUCKET` | `b-cast-audio` | 存储桶名称 |

### 3. 前端环境变量

| 变量名 | 开发环境 | 生产环境 |
|--------|---------|---------|
| `VITE_API_BASE` | `http://localhost:8787` | `https://your-worker.workers.dev` |

### 4. GitHub Secrets

需要在GitHub仓库配置的所有Secrets：

- `R2_ENDPOINT`
- `R2_ACCESS_KEY`
- `R2_SECRET_KEY`
- `R2_BUCKET`
- `CLOUDFLARE_ACCOUNT_ID`
- `D1_DATABASE_ID`
- `CLOUDFLARE_API_TOKEN`

---

## 🔑 详细获取步骤

### Step 1: 获取 CLOUDFLARE_ACCOUNT_ID

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 查看浏览器地址栏
3. URL格式：`https://dash.cloudflare.com/{account_id}/...`
4. 复制 `{account_id}` 部分

**示例：**
```
URL: https://dash.cloudflare.com/abc123def456/workers
Account ID: abc123def456
```

---

### Step 2: 创建并获取 D1_DATABASE_ID

```bash
# 创建D1数据库
wrangler d1 create b-cast-mvp
```

**输出示例：**
```
✅ Successfully created DB 'b-cast-mvp'!

[[d1_databases]]
binding = "DB"
database_name = "b-cast-mvp"
database_id = "12345678-90ab-cdef-1234-567890abcdef"
                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                这就是你需要的 D1_DATABASE_ID
```

复制 `database_id` 的值。

---

### Step 3: 创建 CLOUDFLARE_API_TOKEN

1. 访问 [API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. 点击 "Create Token"
3. 使用模板 "Edit Cloudflare Workers" 或自定义

**自定义权限设置：**
```
Permissions:
  Account > D1 > Edit
  Account > Workers Scripts > Edit
  Account > Account Settings > Read

Account Resources:
  Include > Your Account

TTL:
  Forever（或根据需要）
```

4. 点击 "Continue to summary"
5. 点击 "Create Token"
6. **立即复制Token并保存到安全的地方**（只显示一次）

---

### Step 4: 创建R2 Access Key和Secret Key

1. 进入 [R2](https://dash.cloudflare.com/r2) > "Manage R2 API Tokens"
2. 点击 "Create API Token"

**配置：**
```
Token Name: b-cast-mvp-token

Permissions: Admin Read & Write

TTL: Forever

Apply to specific buckets only: 可选
  - 如果选择，选择 b-cast-audio
  - 不选则对所有bucket生效
```

3. 点击 "Create API Token"
4. 复制显示的信息：
   - **Access Key ID** → 这是 `R2_ACCESS_KEY`
   - **Secret Access Key** → 这是 `R2_SECRET_KEY`
5. **立即保存这两个值**（Secret Access Key只显示一次）

---

### Step 5: 配置 R2_ENDPOINT

R2 Endpoint格式固定，只需替换Account ID：

```
https://{your_account_id}.r2.cloudflarestorage.com
```

**示例：**
```
如果 CLOUDFLARE_ACCOUNT_ID = abc123def456
则 R2_ENDPOINT = https://abc123def456.r2.cloudflarestorage.com
```

---

### Step 6: R2_BUCKET

这是你创建的R2存储桶名称，通常是：

```
b-cast-audio
```

---

## 📝 配置文件模板

### backend/wrangler.toml

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

### frontend/.env.development

```env
VITE_API_BASE=http://localhost:8787
```

### frontend/.env.production

```env
VITE_API_BASE=https://b-cast-mvp.your-subdomain.workers.dev
```

---

## 🎯 GitHub Secrets配置

前往：`https://github.com/YOUR_USERNAME/B-Cast/settings/secrets/actions`

点击 "New repository secret"，逐个添加：

### Secret 1: R2_ENDPOINT
```
Name: R2_ENDPOINT
Value: https://abc123def456.r2.cloudflarestorage.com
```

### Secret 2: R2_ACCESS_KEY
```
Name: R2_ACCESS_KEY
Value: (从Step 4复制的Access Key ID)
```

### Secret 3: R2_SECRET_KEY
```
Name: R2_SECRET_KEY
Value: (从Step 4复制的Secret Access Key)
```

### Secret 4: R2_BUCKET
```
Name: R2_BUCKET
Value: b-cast-audio
```

### Secret 5: CLOUDFLARE_ACCOUNT_ID
```
Name: CLOUDFLARE_ACCOUNT_ID
Value: (从Step 1复制的Account ID)
```

### Secret 6: D1_DATABASE_ID
```
Name: D1_DATABASE_ID
Value: (从Step 2复制的Database ID)
```

### Secret 7: CLOUDFLARE_API_TOKEN
```
Name: CLOUDFLARE_API_TOKEN
Value: (从Step 3复制的API Token)
```

---

## ✅ 验证配置

### 验证Cloudflare配置

```bash
# 测试wrangler登录
wrangler whoami

# 列出D1数据库
wrangler d1 list

# 列出R2存储桶
wrangler r2 bucket list

# 测试D1连接
wrangler d1 execute b-cast-mvp --command "SELECT 1"
```

### 验证后端配置

```bash
cd backend

# 本地测试
wrangler dev --local

# 访问健康检查（在另一个终端）
curl http://localhost:8787/health
```

### 验证GitHub Secrets

1. 前往 Actions > Download Audio (MVP)
2. 点击 "Run workflow"
3. 查看执行日志，不应该有"secret not found"错误

---

## 🔒 安全注意事项

### ⚠️ 永远不要

- ❌ 将Secret提交到Git
- ❌ 在代码中硬编码密钥
- ❌ 在公共场合分享Token
- ❌ 使用生产Token做测试

### ✅ 应该做的

- ✅ 使用环境变量
- ✅ 定期轮换Token
- ✅ 最小权限原则
- ✅ 使用密码管理器保存
- ✅ 及时删除不用的Token

---

## 🔄 更新配置

### 更新Cloudflare Workers环境变量

```bash
# 查看当前配置
wrangler secret list

# 更新Secret
wrangler secret put CLOUDFLARE_API_TOKEN
# 然后输入新值
```

### 更新GitHub Secrets

1. 前往仓库 Settings > Secrets > Actions
2. 找到要更新的Secret
3. 点击 "Update"
4. 输入新值并保存

---

## 📞 获取帮助

如果遇到配置问题：

1. 检查 [部署清单](./mvp-deployment-checklist.md)
2. 查看 [MVP设计文档](./mvp-design.md)
3. 运行验证命令
4. 查看错误日志

---

**文档版本：** v1.0  
**最后更新：** 2026-01-23
