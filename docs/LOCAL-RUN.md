# 本地运行下载脚本

## 快速开始

### 1. 安装依赖

```bash
pip install yt-dlp requests
```

### 2. 设置环境变量

从 `.env` 文件加载环境变量：

```bash
# macOS/Linux
export $(cat .env | xargs)

# 或者手动设置
export WORKER_URL="b-cast.zhangchunxiang98.workers.dev"
export CLOUDFLARE_API_TOKEN="你的token"
export CLOUDFLARE_ACCOUNT_ID="你的account-id"
export R2_BUCKET_NAME="b-cast"
export BILIBILI_SESSDATA="你的SESSDATA"  # 必需！用于避免 412 错误
```

### 3. 运行下载脚本

```bash
python scripts/download_worker.py
```

## 完整命令示例

```bash
# 一次性设置并运行
export $(cat .env | xargs) && \
export BILIBILI_SESSDATA="你的SESSDATA值" && \
python scripts/download_worker.py
```

## 只测试下载（不上传）

如果你想只测试下载功能，不上传到 R2：

```bash
export WORKER_URL="b-cast.zhangchunxiang98.workers.dev"
export BILIBILI_SESSDATA="你的SESSDATA值"
python scripts/download_worker_local.py
```

这个脚本会将文件下载到 `./downloads/` 目录，不会上传到 R2。

## 常见问题

### 问题：HTTP Error 412

**原因**：缺少 B站 Cookie (SESSDATA)

**解决**：
1. 获取 SESSDATA（参考 `docs/GET-BILIBILI-COOKIE.md`）
2. 设置环境变量：`export BILIBILI_SESSDATA="你的值"`

### 问题：找不到 yt-dlp

**解决**：
```bash
pip install yt-dlp
```

### 问题：Wrangler 命令失败

**解决**：
```bash
npm install -g wrangler
# 或
pnpm install -g wrangler
```

## 调试模式

查看详细输出：

```bash
# Python 脚本已经会输出详细信息
python scripts/download_worker.py

# 如果需要更详细的 yt-dlp 输出，脚本中已经设置了 quiet=False
```
