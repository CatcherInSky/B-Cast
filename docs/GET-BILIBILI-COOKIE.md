# 如何获取 B站 Cookie (SESSDATA)

B站的反爬虫机制会返回 412 错误，需要登录 Cookie 才能下载视频。

## 方法1: 从浏览器获取（推荐）

### Chrome/Edge 浏览器

1. 打开 B站并登录：https://www.bilibili.com
2. 按 `F12` 打开开发者工具
3. 切换到 **Application**（应用）标签页
4. 左侧找到 **Cookies** → `https://www.bilibili.com`
5. 找到名为 `SESSDATA` 的 Cookie
6. 复制 **Value** 字段的值

### Firefox 浏览器

1. 打开 B站并登录：https://www.bilibili.com
2. 按 `F12` 打开开发者工具
3. 切换到 **存储** 标签页
4. 左侧找到 **Cookie** → `https://www.bilibili.com`
5. 找到名为 `SESSDATA` 的 Cookie
6. 复制 **值** 字段

## 方法2: 使用浏览器扩展

安装 Cookie 导出扩展（如 "Get cookies.txt LOCALLY"），导出后查找 `SESSDATA` 的值。

## 配置方法

### 本地运行

将 Cookie 添加到 `.env` 文件：

```bash
# 在 .env 文件中添加
BILIBILI_SESSDATA="你的SESSDATA值"
```

或者直接设置环境变量：

```bash
export BILIBILI_SESSDATA="你的SESSDATA值"
```

### GitHub Actions

1. 前往 GitHub 仓库：**Settings → Secrets and variables → Actions**
2. 点击 **New repository secret**
3. 名称：`BILIBILI_SESSDATA`
4. 值：粘贴你的 SESSDATA 值
5. 点击 **Add secret**

## 注意事项

- ⚠️ **SESSDATA 会过期**：通常有效期 1-3 个月，过期后需要重新获取
- 🔒 **不要泄露**：SESSDATA 可以用于访问你的 B站账号，请妥善保管
- 📝 **不要提交到 Git**：`.env` 文件已在 `.gitignore` 中，但请确认不要意外提交

## 验证 Cookie 是否有效

运行诊断脚本检查：

```bash
python scripts/check-upload-status.py
```

或者直接测试下载：

```bash
# 设置环境变量
export BILIBILI_SESSDATA="你的SESSDATA值"
export WORKER_URL="b-cast.zhangchunxiang98.workers.dev"

# 运行下载脚本
python scripts/download_worker.py
```
