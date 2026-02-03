# 检查上传状态指南

## 问题诊断

如果发现文件没有上传到 R2 bucket，请按照以下步骤检查：

### 1. 运行诊断脚本

```bash
# 确保已设置环境变量（从 .env 文件加载）
export $(cat .env | xargs)
python scripts/check-upload-status.py
```

诊断脚本会检查：
- ✅ 环境变量配置
- ✅ Worker API 连接
- ✅ 待下载任务数量
- ✅ R2 访问权限
- ✅ R2 中的现有文件

### 2. 常见问题

#### 问题1: "Found 0 pending downloads"

**原因**: 数据库中没有状态为 `pending` 的下载任务

**解决方案**:
1. 通过前端添加订阅
2. 或通过 API 添加下载任务：
   ```bash
   curl -X POST "https://your-worker.workers.dev/api/downloads/add" \
     -H "Content-Type: application/json" \
     -d '{"bvid": "BV1xx1234567"}'
   ```

#### 问题2: 文件没有上传到 R2

**检查清单**:
- [ ] GitHub Actions workflow 是否成功运行？
- [ ] GitHub Secrets 是否正确配置？
  - `WORKER_URL`
  - `CLOUDFLARE_API_TOKEN`
  - `CLOUDFLARE_ACCOUNT_ID`
  - `R2_BUCKET_NAME`
- [ ] 查看 GitHub Actions 日志中的错误信息

#### 问题3: Wrangler 上传失败

**可能原因**:
1. 缺少 `--remote` 标志（已在代码中修复）
2. Cloudflare 凭证无效
3. R2 bucket 不存在或名称错误

**验证方法**:
```bash
# 检查 R2 bucket 列表
wrangler r2 bucket list

# 检查 R2 中的文件
wrangler r2 object list b-cast --prefix audio/ --remote
```

### 3. 手动测试上传

```bash
# 设置环境变量
export CLOUDFLARE_API_TOKEN="your-token"
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
export R2_BUCKET_NAME="b-cast"

# 测试上传一个文件
echo "test" > test.txt
wrangler r2 object put b-cast/test.txt --file test.txt --remote
```

### 4. 检查 GitHub Actions 日志

1. 前往 GitHub 仓库的 Actions 页面
2. 查看最新的 workflow run
3. 检查以下步骤的输出：
   - "Get pending downloads from Worker API"
   - "Download and upload audio files"
   - "Upload summary"

### 5. 验证 R2 中的文件

```bash
# 列出所有音频文件
wrangler r2 object list b-cast --prefix audio/ --remote

# 下载一个文件验证
wrangler r2 object get b-cast/audio/BV1xx1234567.m4a --remote --file test-download.m4a
```

## 修复记录

### 2026-02-03
- ✅ 修复 `download_worker.py` 中缺少 `--remote` 标志的问题
- ✅ 改进 GitHub Actions workflow，确保即使没有待下载任务也生成 summary
- ✅ 添加诊断脚本 `check-upload-status.py`
