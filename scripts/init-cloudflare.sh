#!/bin/bash
# B-Cast Cloudflare 资源初始化脚本
# 自动创建D1数据库和R2存储桶，并更新wrangler.toml

set -e

echo "🚀 B-Cast Cloudflare 资源初始化"
echo "================================"
echo ""

# 检查wrangler是否安装
if ! command -v wrangler &> /dev/null; then
    echo "❌ wrangler未安装，请运行: npm install -g wrangler"
    exit 1
fi

# 检查是否登录
echo "📝 检查登录状态..."
if ! wrangler whoami &> /dev/null; then
    echo "❌ 未登录Cloudflare，请运行: wrangler login"
    exit 1
fi

echo "✅ 已登录Cloudflare"
echo ""

# 创建D1数据库
echo "📦 创建D1数据库..."
DB_OUTPUT=$(wrangler d1 create b-cast-mvp 2>&1)
echo "$DB_OUTPUT"

# 提取database_id
DATABASE_ID=$(echo "$DB_OUTPUT" | grep "database_id" | sed -n 's/.*database_id = "\([^"]*\)".*/\1/p')

if [ -z "$DATABASE_ID" ]; then
    echo "⚠️  可能数据库已存在，尝试获取现有数据库ID..."
    # 从列表中获取
    DATABASE_ID=$(wrangler d1 list | grep "b-cast-mvp" | awk '{print $1}' | head -1)
fi

if [ -z "$DATABASE_ID" ]; then
    echo "❌ 无法获取数据库ID，请手动创建"
    exit 1
fi

echo "✅ 数据库ID: $DATABASE_ID"
echo ""

# 初始化数据库表
echo "🗄️  初始化数据库表..."
wrangler d1 execute b-cast-mvp --file=./scripts/download_queue.sql
echo "✅ 数据库表创建成功"
echo ""

# 创建R2存储桶
echo "🪣 创建R2存储桶..."
if wrangler r2 bucket create b-cast-audio 2>&1 | grep -q "already exists\|Created"; then
    echo "✅ R2存储桶已就绪"
else
    echo "❌ R2存储桶创建失败"
    exit 1
fi
echo ""

# 更新wrangler.toml
echo "📝 更新wrangler.toml..."
WRANGLER_FILE="./backend/wrangler.toml"

if [ -f "$WRANGLER_FILE" ]; then
    # 使用sed替换database_id（兼容macOS和Linux）
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/database_id = \".*\"/database_id = \"$DATABASE_ID\"/" "$WRANGLER_FILE"
    else
        # Linux
        sed -i "s/database_id = \".*\"/database_id = \"$DATABASE_ID\"/" "$WRANGLER_FILE"
    fi
    echo "✅ wrangler.toml已更新"
else
    echo "❌ 找不到wrangler.toml文件"
    exit 1
fi
echo ""

# 显示配置信息
echo "================================"
echo "✅ 初始化完成！"
echo ""
echo "📋 配置信息："
echo "  Database ID: $DATABASE_ID"
echo "  Database Name: b-cast-mvp"
echo "  R2 Bucket: b-cast-audio"
echo ""
echo "📝 下一步："
echo "  1. 配置R2公开访问（在Dashboard中）"
echo "  2. 创建R2 API Token"
echo "  3. 创建Cloudflare API Token"
echo "  4. 配置GitHub Secrets"
echo ""
echo "详见: docs/mvp-deployment-checklist.md"
echo "================================"
