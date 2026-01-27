#!/bin/bash

# B-Cast 本地数据库初始化脚本

set -e

echo "🚀 B-Cast 本地数据库初始化"
echo ""

# 检查是否在正确的目录
if [ ! -f "wrangler.toml" ]; then
  echo "❌ 请在 backend 目录下运行此脚本"
  echo "   cd backend && ./init-local-db.sh"
  exit 1
fi

echo "📋 初始化本地D1数据库..."
echo ""

# 使用pnpm exec wrangler执行SQL
pnpm exec wrangler d1 execute b-cast --local --file=../scripts/init-db.sql

echo ""
echo "✅ 本地数据库初始化完成！"
echo ""
echo "📝 验证表创建："
pnpm exec wrangler d1 execute b-cast --local --command "SELECT name FROM sqlite_master WHERE type='table';"
echo ""
echo "🎉 接下来："
echo "   1. 运行 pnpm run dev 启动开发服务器"
echo "   2. 在前端添加订阅测试"
echo ""
