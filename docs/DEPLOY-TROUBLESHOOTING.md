# 部署问题排查指南

## ERR_CONNECTION_TIMED_OUT 无法访问 Worker

当浏览器显示「连接超时」或 `ERR_CONNECTION_TIMED_OUT` 时，按以下步骤排查。

### 1. 确认使用 https:// 访问

**正确格式：**
```
https://b-cast.zhangchunxiang98.workers.dev
```

不要省略 `https://`，也不要使用 `http://`（workers.dev 只支持 HTTPS）。

### 2. 在 Cloudflare Dashboard 验证部署

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 左侧选择 **Workers & Pages**
3. 找到 **b-cast**，点击进入
4. 查看 **Deployments** 标签，确认有「Active」的部署
5. 点击 **View** 或 **Quick Edit** 旁的 **Visit** 链接，在 Cloudflare 提供的预览里测试

若在 Dashboard 内能打开，说明 Worker 已部署成功，问题多半在本地网络。

### 3. 检查 workers.dev 路由是否开启

1. 在 Worker 详情页进入 **Settings** → **Domains & Routes**
2. 确认 **workers.dev** 路由已启用（应有类似 `b-cast.zhangchunxiang98.workers.dev` 的条目）
3. 若被禁用，在 **Workers & Pages** 首页右侧找到 **Your subdomain**，确认子域已设置且未关闭

### 4. 网络环境（中国大陆用户）

`*.workers.dev` 在国内可能被限速或无法访问，表现为长时间无响应或超时。

**可行方案：**

| 方案 | 说明 |
|------|------|
| **换网络** | 用手机热点、公司网络或其它网络重试 |
| **VPN/代理** | 使用可访问国际站的网络后再访问 Worker URL |
| **自定义域名** | 绑定自己的域名并走 Cloudflare 代理，国内访问通常更稳定 |

**绑定自定义域名：**

1. 在 Cloudflare 添加你的域名（或使用已有域名）
2. Worker 详情页 → **Settings** → **Domains & Routes** → **Add**
3. 添加自定义域名（如 `api.yourdomain.com`）
4. 之后用 `https://api.yourdomain.com` 访问 Worker

### 5. 用命令行快速测 Worker 是否可达

在终端执行（将 URL 换成你的 Worker 地址）：

```bash
# 健康检查
curl -v --connect-timeout 10 "https://b-cast.zhangchunxiang98.workers.dev/health"
```

- 若返回 `{"status":"ok",...}`，说明 Worker 正常，问题在浏览器或本地网络。
- 若 `curl` 也超时，说明当前网络到 workers.dev 不通，需按上面「网络环境」部分处理。

### 6. 确认部署脚本没有报错

部署时应看到类似输出：

```
✓ 后端部署成功
  Worker URL: b-cast.zhangchunxiang98.workers.dev
```

若部署阶段就报错，先解决报错再按上述步骤验证访问。

---

## 小结

| 现象 | 可能原因 | 建议 |
|------|----------|------|
| 连接超时 | 未加 `https://` | 使用 `https://...workers.dev` |
| 连接超时 | workers.dev 在国内不可达 | 换网络/VPN，或绑定自定义域名 |
| 连接超时 | workers.dev 路由被关 | 在 Dashboard 开启 workers.dev 子域/路由 |
| 404 / 5xx | Worker 或路由配置有误 | 在 Dashboard 的 Deployments 里点 Visit 测试，查日志 |

部署是否「成功」以 Cloudflare Dashboard 中有 Active 部署、且在 Dashboard 内能访问为准；浏览器超时多半是本地到 workers.dev 的网络问题。
