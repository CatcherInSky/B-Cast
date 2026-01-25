#!/bin/bash
# 检查环境配置是否完整

echo "🔍 B-Cast 环境检查"
echo "=================="
echo ""

# 检查Node.js
echo "📦 Node.js:"
if command -v node &> /dev/null; then
    echo "   ✅ $(node --version)"
else
    echo "   ❌ 未安装"
fi

# 检查wrangler
echo ""
echo "🔧 Wrangler:"
if command -v wrangler &> /dev/null; then
    echo "   ✅ $(wrangler --version)"
else
    echo "   ❌ 未安装"
fi

# 检查后端配置
echo ""
echo "⚙️  后端配置:"
if [ -f "backend/wrangler.toml" ]; then
    if grep -q 'database_id = ""' backend/wrangler.toml; then
        echo "   ❌ database_id 未配置"
    else
        echo "   ✅ wrangler.toml 已配置"
    fi
else
    echo "   ❌ wrangler.toml 不存在"
fi

# 检查前端配置
echo ""
echo "🎨 前端配置:"
if [ -f "frontend/.env.production" ]; then
    echo "   ✅ .env.production 存在"
    if grep -q "VITE_API_BASE=https://" frontend/.env.production; then
        echo "   ✅ VITE_API_BASE 已配置"
    else
        echo "   ⚠️  VITE_API_BASE 可能未正确配置"
    fi
else
    echo "   ❌ .env.production 不存在"
fi

# 检查数据库文件
echo ""
echo "💾 数据库Schema:"
if [ -f "scripts/download_queue.sql" ]; then
    echo "   ✅ download_queue.sql 存在"
else
    echo "   ❌ download_queue.sql 不存在"
fi

# 检查GitHub Actions
echo ""
echo "🤖 GitHub Actions:"
if [ -f ".github/workflows/download-audio.yml" ]; then
    echo "   ✅ workflow 已配置"
else
    echo "   ❌ workflow 不存在"
fi

# 检查Python脚本
echo ""
echo "🐍 下载脚本:"
if [ -f "scripts/download_worker.py" ]; then
    echo "   ✅ download_worker.py 存在"
else
    echo "   ❌ download_worker.py 不存在"
fi

# 检查依赖
echo ""
echo "📦 依赖检查:"

if [ -d "frontend/node_modules" ]; then
    echo "   ✅ 前端依赖已安装"
else
    echo "   ❌ 前端依赖未安装 (运行: cd frontend && npm install)"
fi

if [ -d "backend/node_modules" ]; then
    echo "   ✅ 后端依赖已安装"
else
    echo "   ❌ 后端依赖未安装 (运行: cd backend && npm install)"
fi

echo ""
echo "=================="
echo "检查完成！"
