# 本地测试下载脚本指南

## 🎯 两个版本的脚本

### 1. `download_worker.py` - 完整版
- ✅ 下载音频
- ✅ 上传到R2（通过wrangler）
- ✅ 更新数据库状态
- 🎯 **用于生产环境和完整测试**

### 2. `download_worker_local.py` - 本地测试版（推荐）
- ✅ 下载音频
- ⚠️ 不上传到R2（保存在本地 `./downloads/` 目录）
- ✅ 更新数据库状态
- 🎯 **用于快速本地测试**

---

## 🚀 快速开始（推荐：使用本地测试版）

### 步骤1: 安装依赖

```bash
# 安装Python依赖
pip install yt-dlp requests

# 或使用requirements.txt
pip install -r requirements.txt
```

### 步骤2: 启动Backend服务

```bash
# Terminal 1
cd backend
pnpm run dev
# ✅ 运行在 http://localhost:8787
```

### 步骤3: 添加测试订阅

```bash
# Terminal 2
# 方式1: 通过前端UI
cd frontend
npm run dev
# 访问 http://localhost:5173，添加一个B站URL

# 方式2: 通过API
curl -X POST http://localhost:8787/api/subscriptions/add \
  -H "Content-Type: application/json" \
  -d '{"url":"https://space.bilibili.com/437316738"}'
```

### 步骤4: 运行本地测试脚本

```bash
# Terminal 3
cd scripts
python download_worker_local.py
```

---

## 📋 预期输出

```bash
🚀 B-Cast Download Worker (本地测试版)
📅 2026-01-25T12:00:00.000000
🌐 Worker URL: http://localhost:8787
💾 下载目录: ./downloads/

📥 获取待下载任务...
📋 找到 3 个待下载任务

⏳ 处理: BV1xx411c7xx - 【英语学习】如何提高听力...
   📥 下载中...
[download] Downloading video 1 of 1
[download] 100% of 5.23MiB in 00:03
[ExtractAudio] Destination: ./downloads/BV1xx411c7xx.m4a
   ✅ 已下载: 5.23MB
   💾 保存位置: downloads/BV1xx411c7xx.m4a
✅ 完成: BV1xx411c7xx

⏳ 处理: BV1yy411c7yy - 另一个视频...
   📥 下载中...
[download] Downloading video 1 of 1
[download] 100% of 8.15MiB in 00:05
[ExtractAudio] Destination: ./downloads/BV1yy411c7yy.m4a
   ✅ 已下载: 8.15MB
   💾 保存位置: downloads/BV1yy411c7yy.m4a
✅ 完成: BV1yy411c7yy

============================================================
✅ 成功: 2
❌ 失败: 0
📊 总计: 2
============================================================

💾 下载的文件保存在: ./downloads/
```

---

## 🔧 完整版测试（上传到R2）

如果你想测试完整流程（包括上传到R2）：

### 步骤1: 设置环境变量

```bash
# 使用本地模拟的R2
export WORKER_URL="http://localhost:8787"
export CLOUDFLARE_API_TOKEN="dummy-token"
export CLOUDFLARE_ACCOUNT_ID="dummy-account"
export R2_BUCKET_NAME="b-cast-audio"

# 可选：B站Cookie（用于下载会员专享视频）
# export BILIBILI_SESSDATA="your-sessdata-here"
```

### 步骤2: 运行完整版脚本

```bash
cd scripts
python download_worker.py
```

**注意：** 完整版会尝试使用 `wrangler` 上传到R2，文件会保存到：
```
backend/.wrangler/state/v3/r2/b-cast-audio/audio/
```

---

## 📂 文件结构

```
scripts/
  ├── download_worker.py        # 完整版（上传到R2）
  ├── download_worker_local.py  # 本地测试版（不上传）
  └── downloads/                # 本地测试版的下载目录
      ├── BV1xx411c7xx.m4a
      ├── BV1yy411c7yy.m4a
      └── ...
```

---

## 🎯 验证下载状态

### 查看下载队列状态

```bash
# 查看所有任务
curl http://localhost:8787/api/downloads/list | jq

# 查看特定视频状态
curl "http://localhost:8787/api/downloads/status?bvids=BV1xx411c7xx" | jq
```

### 查看数据库

```bash
cd backend
pnpm exec wrangler d1 execute b-cast-mvp --local \
  --command "SELECT bvid, title, status, audio_url FROM download_queue;"
```

---

## 🐛 常见问题

### Q: yt-dlp not installed

```bash
pip install yt-dlp
```

### Q: 无法连接到Worker

**原因：** Backend服务未启动

**解决：**
```bash
cd backend
pnpm run dev
```

### Q: 下载失败：HTTP Error 403

**原因：** B站反爬虫或视频需要登录

**解决：**
```bash
# 设置B站Cookie
export BILIBILI_SESSDATA="your-sessdata"
```

获取SESSDATA方法：
1. 登录 bilibili.com
2. F12打开开发者工具
3. Application → Cookies → https://www.bilibili.com
4. 找到 `SESSDATA` 的值

### Q: FFmpeg not found

**原因：** 缺少FFmpeg（用于音频转换）

**解决：**
```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg

# Windows
# 下载 https://ffmpeg.org/download.html
```

### Q: wrangler command not found（完整版）

**解决：**
```bash
cd backend
pnpm exec wrangler --version

# 或使用完整路径
export PATH="$PATH:$(pwd)/node_modules/.bin"
```

---

## 📊 性能说明

### 下载速度
- 取决于网络速度和B站服务器
- 一般：1-5MB/s
- 单个5分钟视频：约30秒-2分钟

### 资源占用
- CPU：FFmpeg转码时较高（10-30%）
- 内存：约100-200MB
- 磁盘：临时文件约为视频大小的2倍

### 并发支持
- 当前脚本：顺序下载（一次一个）
- 可以运行多个脚本实例并发下载
- 建议最多3-5个并发实例

---

## 🎉 测试流程

### 完整测试流程

1. **启动服务**
   ```bash
   cd backend && pnpm run dev
   ```

2. **添加订阅**
   ```bash
   # 前端或API
   ```

3. **查看队列**
   ```bash
   curl http://localhost:8787/api/downloads/pending
   ```

4. **运行下载**
   ```bash
   cd scripts
   python download_worker_local.py
   ```

5. **验证结果**
   ```bash
   ls -lh downloads/
   curl http://localhost:8787/api/downloads/list | jq
   ```

6. **播放测试**
   ```bash
   # macOS
   open downloads/BV1xx411c7xx.m4a
   
   # Linux
   vlc downloads/BV1xx411c7xx.m4a
   ```

---

## 🚀 生产环境部署

生产环境使用 GitHub Actions 运行 `download_worker.py`：

1. 配置GitHub Secrets
2. 推送代码到GitHub
3. Actions自动运行下载任务
4. 上传到真实的Cloudflare R2

详见：[GitHub Actions配置](../docs/DATA-FLOW-TESTING.md)

---

## 💡 开发建议

### 本地开发流程

1. ✅ 使用 `download_worker_local.py` 快速迭代
2. ✅ 下载到本地目录，方便查看和测试
3. ✅ 不需要配置Cloudflare凭证
4. ✅ 更快的反馈循环

### 生产部署前

1. ✅ 使用 `download_worker.py` 完整测试
2. ✅ 验证R2上传功能
3. ✅ 测试GitHub Actions工作流
4. ✅ 验证RSS更新

---

## 📚 相关文档

- [数据链路与测试](../docs/DATA-FLOW-TESTING.md)
- [本地开发指南](../docs/LOCAL-TESTING.md)
- [环境变量配置](../docs/ENV-SETUP.md)
