# 如何获取B站Cookie

## 📋 前提条件

- 需要一个已登录的B站账号
- 建议使用小号，不要使用主账号

---

## 🌐 方法1：Chrome/Edge浏览器（推荐）

### 步骤：

#### 1. 登录B站
访问 https://www.bilibili.com 并登录你的账号

#### 2. 打开开发者工具
- **Windows/Linux**: 按 `F12` 或 `Ctrl+Shift+I`
- **Mac**: 按 `Cmd+Option+I`

#### 3. 切换到 Network (网络) 标签
![Network Tab](https://i.imgur.com/example.png)

#### 4. 刷新页面
按 `F5` 或点击刷新按钮

#### 5. 找到请求
在左侧列表中找到第一个请求（通常是 `www.bilibili.com`）

#### 6. 查看Cookie
- 点击该请求
- 切换到 **Headers (标头)** 标签
- 滚动找到 **Request Headers (请求标头)**
- 找到 **Cookie:** 行

#### 7. 复制Cookie
- 右键点击Cookie值
- 选择 "Copy value (复制值)"

### 示例截图：

```
Request Headers:
  ...
  Cookie: SESSDATA=cb06xxx...; bili_jct=xxx...; DedeUserID=123456; ...
  ...
```

---

## 🦊 方法2：Firefox浏览器

### 步骤：

#### 1. 登录B站
访问 https://www.bilibili.com 并登录

#### 2. 打开开发者工具
按 `F12` 或 `Ctrl+Shift+I` (Mac: `Cmd+Option+I`)

#### 3. 切换到 "网络" 标签

#### 4. 刷新页面

#### 5. 点击任意请求
选择列表中的第一个请求

#### 6. 查看Cookie
在右侧面板找到 **标头** → **请求标头** → **Cookie**

#### 7. 复制完整的Cookie字符串

---

## 🍎 方法3：Safari浏览器

### 步骤：

#### 1. 启用开发菜单
- 打开 Safari → 偏好设置
- 切换到 "高级" 标签
- 勾选 "在菜单栏中显示开发菜单"

#### 2. 登录B站

#### 3. 打开Web检查器
- 菜单栏 → 开发 → 显示Web检查器
- 或按 `Cmd+Option+I`

#### 4. 切换到 "网络" 标签

#### 5. 刷新页面

#### 6. 选择请求并查看Cookie

---

## 🔧 方法4：使用浏览器扩展（最简单）

### 推荐扩展：

#### Chrome/Edge: "EditThisCookie"
1. 安装扩展：[EditThisCookie](https://chrome.google.com/webstore/detail/editthiscookie/fngmhnnpilhplaeedifhccceomclgfbg)
2. 访问并登录 bilibili.com
3. 点击浏览器工具栏的 Cookie 图标
4. 点击 "Export" 按钮
5. 选择 "Header String" 格式
6. 复制导出的Cookie字符串

#### Firefox: "Cookie-Editor"
1. 安装扩展：[Cookie-Editor](https://addons.mozilla.org/en-US/firefox/addon/cookie-editor/)
2. 访问并登录 bilibili.com
3. 点击扩展图标
4. 点击 "Export" → "Header String"
5. 复制Cookie字符串

---

## 🔍 验证Cookie

### 检查Cookie是否完整

确保你的Cookie包含以下关键字段：

```
SESSDATA=cb06xxx...     ← 最重要，长字符串
bili_jct=xxx...         ← CSRF Token
DedeUserID=123456       ← 你的用户ID
DedeUserID__ckMd5=xxx   ← 用户ID校验
```

### 测试Cookie是否有效

访问这个API（替换成你的Cookie）：
```bash
curl 'https://api.bilibili.com/x/web-interface/nav' \
  -H 'Cookie: SESSDATA=你的SESSDATA; bili_jct=你的bili_jct; DedeUserID=你的DedeUserID; DedeUserID__ckMd5=你的DedeUserID__ckMd5'
```

**预期响应：**
```json
{
  "code": 0,
  "message": "0",
  "data": {
    "isLogin": true,
    "uname": "你的用户名",
    ...
  }
}
```

如果 `isLogin: true`，说明Cookie有效！

---

## 🔐 安全注意事项

### ⚠️ 重要警告

1. **不要泄露Cookie**
   - Cookie相当于登录凭证
   - 任何人获得你的Cookie都可以登录你的账号

2. **建议使用小号**
   - 不要使用主账号的Cookie
   - 创建一个专门用于B-Cast的小号

3. **定期更换Cookie**
   - B站Cookie会过期（通常几个月）
   - 如果失效，需要重新获取

4. **不要提交到Git**
   - Cookie应该保存在环境变量或配置文件中
   - 不要提交到公开的代码仓库

---

## 📦 在B-Cast中使用Cookie

### 方法1：环境变量（推荐）

创建 `.env` 文件：
```bash
# backend/.env
BILIBILI_COOKIE="SESSDATA=xxx; bili_jct=xxx; DedeUserID=xxx; DedeUserID__ckMd5=xxx"
```

### 方法2：Cloudflare Workers环境变量

```bash
# 在backend目录
wrangler secret put BILIBILI_COOKIE
# 然后粘贴你的Cookie字符串
```

### 方法3：wrangler.toml配置（本地开发）

```toml
[vars]
BILIBILI_COOKIE = "SESSDATA=xxx; bili_jct=xxx; ..."
```

⚠️ **注意**：不要将包含真实Cookie的配置文件提交到Git！

---

## 🔄 Cookie过期了怎么办？

### 症状：
- API返回 "账号未登录"
- 解析UP主空间失败

### 解决方法：
1. 退出B站账号
2. 重新登录
3. 重新获取Cookie
4. 更新环境变量

---

## 🎯 快速参考

### 最简单的方法：

1. ✅ 安装 EditThisCookie (Chrome) 或 Cookie-Editor (Firefox)
2. ✅ 登录 bilibili.com
3. ✅ 点击扩展 → Export → Header String
4. ✅ 复制Cookie字符串
5. ✅ 保存到 `.env` 文件

### 完整的Cookie示例（脱敏）：

```
SESSDATA=cb06xxx*********************************; bili_jct=xxx***; DedeUserID=123456; DedeUserID__ckMd5=xxx***; buvid3=xxx; buvid4=xxx; sid=xxx
```

---

## 🆘 常见问题

### Q: Cookie多久过期？
A: 通常几个月，具体取决于B站的设置。

### Q: 可以多个项目共用一个Cookie吗？
A: 可以，但不推荐。建议每个项目使用独立的小号。

### Q: Cookie泄露了怎么办？
A: 立即更改B站账号密码，这会使所有Cookie失效。

### Q: 必须要Cookie吗？
A: 如果只使用合集和单视频，不需要Cookie。只有解析UP主全部投稿才需要。

---

## 📚 相关文档

- [API限制说明](./BILIBILI-API-LIMITATIONS.md)
- [最终方案](./FINAL-SOLUTION.md)
- [与RSSHub对比](./RSSHUB-COMPARISON.md)

---

**更新日期：** 2026-01-23  
**适用版本：** B-Cast v1.1+（计划中）
