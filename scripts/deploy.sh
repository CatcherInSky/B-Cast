#!/bin/bash
# B-Cast 一键部署脚本
# 自动检查环境、构建、部署后端和前端

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${2}${1}${NC}"
}

# 检查命令是否存在
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

log "🚀 B-Cast 一键部署" "$BLUE"
log "================================" "$BLUE"
echo ""

# 1. 检查必需工具
log "📝 检查必需工具..." "$BLUE"

if ! command_exists wrangler; then
    log "❌ wrangler未安装" "$RED"
    log "   安装命令: npm install -g wrangler" "$YELLOW"
    exit 1
fi
log "✅ wrangler 已安装" "$GREEN"

if ! command_exists node; then
    log "❌ Node.js未安装" "$RED"
    exit 1
fi
log "✅ Node.js 已安装" "$GREEN"

echo ""

# 2. 检查登录状态
log "🔐 检查Cloudflare登录状态..." "$BLUE"
if ! wrangler whoami &> /dev/null; then
    log "❌ 未登录Cloudflare" "$RED"
    log "   正在打开登录页面..." "$YELLOW"
    wrangler login
fi
log "✅ 已登录Cloudflare" "$GREEN"
echo ""

# 3. 运行初始化检查
log "🔍 运行部署前检查..." "$BLUE"
node scripts/check-deployment.js
echo ""

# 4. 询问是否继续
read -p "是否继续部署？(y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log "❌ 取消部署" "$YELLOW"
    exit 0
fi
echo ""

# 5. 部署后端
log "📦 部署后端 (Cloudflare Workers)..." "$BLUE"
cd backend

if [ ! -d "node_modules" ]; then
    log "   安装依赖..." "$YELLOW"
    npm install
fi

log "   执行部署..." "$YELLOW"
wrangler deploy

if [ $? -eq 0 ]; then
    log "✅ 后端部署成功" "$GREEN"
    
    # 获取Worker URL
    WORKER_URL=$(wrangler deployments list --json 2>/dev/null | grep -o '"url":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "")
    if [ -n "$WORKER_URL" ]; then
        log "   Worker URL: $WORKER_URL" "$BLUE"
        
        # 更新前端环境变量
        cd ../frontend
        if [ ! -f ".env.production" ] || grep -q "your-subdomain" .env.production 2>/dev/null; then
            log "   自动更新前端环境变量..." "$YELLOW"
            echo "VITE_API_BASE=$WORKER_URL" > .env.production
            log "   已更新 frontend/.env.production" "$GREEN"
        fi
        cd ../backend
    fi
else
    log "❌ 后端部署失败" "$RED"
    exit 1
fi

cd ..
echo ""

# 6. 部署前端
log "🎨 部署前端 (Cloudflare Pages)..." "$BLUE"
cd frontend

if [ ! -d "node_modules" ]; then
    log "   安装依赖..." "$YELLOW"
    npm install
fi

log "   构建前端..." "$YELLOW"
npm run build

if [ $? -eq 0 ]; then
    log "✅ 前端构建成功" "$GREEN"
    
    log "   部署到Cloudflare Pages..." "$YELLOW"
    wrangler pages deploy dist --project-name=b-cast-mvp
    
    if [ $? -eq 0 ]; then
        log "✅ 前端部署成功" "$GREEN"
    else
        log "❌ 前端部署失败" "$RED"
        log "   请检查 Cloudflare Pages 项目是否已创建" "$YELLOW"
        exit 1
    fi
else
    log "❌ 前端构建失败" "$RED"
    exit 1
fi

cd ..
echo ""

# 7. 完成
log "================================" "$BLUE"
log "🎉 部署完成！" "$GREEN"
log "" 
log "📋 后续步骤：" "$BLUE"
log "   1. 检查Worker是否正常运行" 
log "   2. 检查Pages是否正常访问"
log "   3. 配置GitHub Secrets（如果使用GitHub Actions）"
log "   4. 测试完整功能流程"
log ""
log "详见: docs/mvp-deployment-checklist.md" "$BLUE"
log "================================" "$BLUE"
