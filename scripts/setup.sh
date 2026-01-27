#!/bin/bash
# B-Cast MVP 快速配置脚本

set -e

echo "🚀 B-Cast MVP 配置向导"
echo "===================="
echo ""

# 检查依赖
echo "📋 检查依赖..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装，请先安装 Node.js 18+"
    exit 1
fi

if ! command -v wrangler &> /dev/null; then
    echo "⚠️  wrangler 未安装，正在安装..."
    npm install -g wrangler@latest
fi

echo "✅ 依赖检查完成"
echo ""

# 登录Cloudflare
echo "🔐 登录Cloudflare..."
wrangler login

echo ""
echo "📦 创建D1数据库..."
echo "请输入数据库名称 (默认: b-cast):"
read -r db_name
db_name=${db_name:-b-cast}

# 创建D1数据库
db_output=$(wrangler d1 create "$db_name" 2>&1)
echo "$db_output"

# 提取database_id
database_id=$(echo "$db_output" | grep -oP 'database_id = "\K[^"]+' | head -1)

if [ -z "$database_id" ]; then
    echo "❌ 无法获取database_id，请手动配置"
    exit 1
fi

echo "✅ Database ID: $database_id"

# 更新wrangler.toml
echo ""
echo "📝 更新 backend/wrangler.toml..."
sed -i.bak "s/database_id = \"\"/database_id = \"$database_id\"/" backend/wrangler.toml
rm backend/wrangler.toml.bak 2>/dev/null || true

# 初始化数据库
echo ""
echo "📊 初始化数据库..."
wrangler d1 execute "$db_name" --file=scripts/download_queue.sql

echo "✅ 数据库配置完成"

# 创建R2 Bucket
echo ""
echo "🪣 创建R2 Bucket..."
echo "请输入bucket名称 (默认: b-cast-audio):"
read -r bucket_name
bucket_name=${bucket_name:-b-cast-audio}

wrangler r2 bucket create "$bucket_name"
echo "✅ R2 Bucket创建完成"

echo ""
echo "⚠️  重要：请在Cloudflare Dashboard中配置R2公开访问"
echo "   1. 访问 https://dash.cloudflare.com/"
echo "   2. 进入 R2 > $bucket_name > Settings"
echo "   3. 在 Public Access 部分点击 Allow Access"
echo ""
read -p "配置完成后按回车继续..."

# 安装依赖
echo ""
echo "📦 安装依赖..."

echo "安装后端依赖..."
cd backend
npm install

echo "安装前端依赖..."
cd ../frontend
npm install
cd ..

echo "✅ 依赖安装完成"

# 部署后端
echo ""
echo "🚀 部署后端..."
cd backend
deploy_output=$(wrangler deploy 2>&1)
echo "$deploy_output"

# 提取Worker URL
worker_url=$(echo "$deploy_output" | grep -oP 'https://[^\s]+\.workers\.dev' | head -1)

if [ -z "$worker_url" ]; then
    echo "⚠️  无法自动获取Worker URL，请手动配置"
    echo "请输入部署的Worker URL:"
    read -r worker_url
fi

echo "✅ Worker URL: $worker_url"

# 配置前端
echo ""
echo "📝 配置前端环境变量..."
cd ../frontend

if [ ! -f .env.production ]; then
    cat > .env.production <<EOF
VITE_API_BASE=$worker_url
EOF
    echo "✅ 已创建 frontend/.env.production"
else
    echo "⚠️  .env.production 已存在，请手动更新 VITE_API_BASE"
fi

cd ..

echo ""
echo "🎉 配置完成！"
echo ""
echo "📋 下一步："
echo "   1. 配置GitHub Secrets (见 docs/DEPLOYMENT.md)"
echo "   2. 本地测试: cd frontend && npm run dev"
echo "   3. 添加播放列表测试"
echo ""
echo "📚 更多信息请查看 README.md 和 docs/DEPLOYMENT.md"
