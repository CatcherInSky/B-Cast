#!/bin/bash

# B-Cast 简化部署脚本
# 本地开发只需要wrangler login，不需要额外的credentials

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     B-Cast 部署脚本                   ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# ========== 检查环境 ==========
echo -e "${YELLOW}📋 检查环境...${NC}"

# 检查是否在项目根目录
if [ ! -f "package.json" ] || [ ! -d "backend" ]; then
  echo -e "${RED}❌ 请在项目根目录运行此脚本${NC}"
  exit 1
fi

# 检查wrangler登录状态
cd backend
if ! pnpm exec wrangler whoami &>/dev/null; then
  echo -e "${RED}❌ 未登录Cloudflare${NC}"
  echo -e "${YELLOW}请先运行: cd backend && pnpm exec wrangler login${NC}"
  exit 1
fi

echo -e "${GREEN}✓${NC} Cloudflare已登录"
cd ..

# 检查.env文件
if [ ! -f ".env" ]; then
  echo -e "${YELLOW}⚠️  .env 文件不存在，使用默认配置${NC}"
  echo -e "${YELLOW}   首次部署后，建议创建.env文件并填入WORKER_URL${NC}"
  # 创建最小配置
  cat > .env << EOF
D1_DATABASE_NAME="b-cast"
D1_DATABASE_ID=""
R2_BUCKET_NAME="b-cast-audio"
WORKER_URL=""
EOF
fi

# 加载环境变量
source .env

echo ""

# ========== 验证D1配置 ==========
echo -e "${YELLOW}🗄️  检查D1数据库配置...${NC}"

if [ -z "$D1_DATABASE_ID" ]; then
  echo -e "${YELLOW}⚠️  D1_DATABASE_ID未设置${NC}"
  echo -e "${BLUE}📝 需要创建D1数据库${NC}"
  echo ""
  
  # 尝试创建数据库
  cd backend
  DB_NAME="${D1_DATABASE_NAME:-b-cast}"
  
  # 检查数据库是否已存在
  if pnpm exec wrangler d1 list | grep -q "$DB_NAME"; then
    echo -e "${GREEN}✓${NC} 数据库 $DB_NAME 已存在"
    echo ""
    echo -e "${YELLOW}请将数据库ID填入 .env 文件：${NC}"
    echo "  1. 运行: pnpm exec wrangler d1 list"
    echo "  2. 找到 $DB_NAME 的 database_id"
    echo "  3. 更新 .env: D1_DATABASE_ID=\"your-database-id\""
    echo ""
    cd ..
    exit 1
  else
    echo "  创建数据库: $DB_NAME"
    CREATE_OUTPUT=$(pnpm exec wrangler d1 create "$DB_NAME" 2>&1)
    
    # 提取database_id
    DB_ID=$(echo "$CREATE_OUTPUT" | grep -o 'database_id = "[^"]*"' | cut -d'"' -f2)
    
    if [ -n "$DB_ID" ]; then
      echo -e "${GREEN}✓${NC} 数据库已创建: $DB_ID"
      
      # 更新.env文件
      if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/D1_DATABASE_ID=\"\"/D1_DATABASE_ID=\"$DB_ID\"/" ../.env
      else
        sed -i "s/D1_DATABASE_ID=\"\"/D1_DATABASE_ID=\"$DB_ID\"/" ../.env
      fi
      
      D1_DATABASE_ID="$DB_ID"
      echo -e "${GREEN}✓${NC} 已更新 .env 文件"
    else
      echo -e "${RED}❌ 数据库创建失败${NC}"
      cd ..
      exit 1
    fi
  fi
  cd ..
else
  echo -e "${GREEN}✓${NC} D1配置已设置: $D1_DATABASE_ID"
fi

echo ""

# ========== 生成 wrangler.toml ==========
echo -e "${YELLOW}📝 生成 wrangler.toml...${NC}"

DB_NAME="${D1_DATABASE_NAME:-b-cast}"
BUCKET_NAME="${R2_BUCKET_NAME:-b-cast-audio}"

cat > backend/wrangler.toml << EOF
name = "b-cast"
main = "src/index.ts"
compatibility_date = "2024-01-01"

# D1 Database binding
[[d1_databases]]
binding = "DB"
database_name = "$DB_NAME"
database_id = "$D1_DATABASE_ID"

# R2 Storage binding
[[r2_buckets]]
binding = "BUCKET"
bucket_name = "$BUCKET_NAME"

# Cron Triggers
[triggers]
crons = ["0 2 * * *"]

# Environment variables
[vars]
WORKER_URL = "${WORKER_URL}"
EOF

echo -e "${GREEN}✓${NC} wrangler.toml 已生成"
echo ""

# ========== 安装依赖 ==========
echo -e "${YELLOW}📦 检查依赖...${NC}"

if [ ! -d "backend/node_modules" ]; then
  echo "  安装 Backend 依赖..."
  cd backend
  pnpm install
  cd ..
else
  echo -e "${GREEN}✓${NC} Backend 依赖已安装"
fi

echo ""

# ========== 初始化D1数据库 ==========
echo -e "${YELLOW}🗄️  初始化D1数据库...${NC}"

cd backend
if pnpm exec wrangler d1 execute "$DB_NAME" --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name='subscriptions';" 2>&1 | grep -q "subscriptions"; then
  echo -e "${GREEN}✓${NC} 数据库表已存在"
else
  echo "  创建数据库表..."
  pnpm exec wrangler d1 execute "$DB_NAME" --remote --file=../scripts/init-db.sql
  echo -e "${GREEN}✓${NC} 数据库初始化完成"
fi
cd ..

echo ""

# ========== 部署Backend ==========
echo -e "${YELLOW}🚀 部署 Backend...${NC}"

cd backend
DEPLOY_OUTPUT=$(pnpm run deploy 2>&1 | tee /dev/tty)

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓${NC} Backend 部署成功"
  
  # 尝试提取Worker URL
  DEPLOYED_URL=$(echo "$DEPLOY_OUTPUT" | grep -o 'https://[^ ]*workers.dev' | head -1)
  
  if [ -n "$DEPLOYED_URL" ] && [ -z "$WORKER_URL" ]; then
    # 去掉https://前缀
    URL_WITHOUT_PROTOCOL=${DEPLOYED_URL#https://}
    
    echo ""
    echo -e "${YELLOW}📝 检测到Worker URL: $DEPLOYED_URL${NC}"
    echo -e "${YELLOW}   建议更新 .env 文件：${NC}"
    echo "   WORKER_URL=\"$URL_WITHOUT_PROTOCOL\""
    echo ""
    
    # 询问是否自动更新
    read -p "是否自动更新 .env 文件？(y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s|WORKER_URL=\"\"|WORKER_URL=\"$URL_WITHOUT_PROTOCOL\"|" ../.env
      else
        sed -i "s|WORKER_URL=\"\"|WORKER_URL=\"$URL_WITHOUT_PROTOCOL\"|" ../.env
      fi
      echo -e "${GREEN}✓${NC} .env 文件已更新"
    fi
  fi
else
  echo -e "${RED}❌ Backend 部署失败${NC}"
  exit 1
fi
cd ..

echo ""

# ========== 完成 ==========
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     🎉 部署完成！                     ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""

if [ -n "$DEPLOYED_URL" ]; then
  echo -e "${BLUE}📡 Worker URL:${NC}"
  echo "   $DEPLOYED_URL"
  echo ""
  echo -e "${YELLOW}📝 测试部署:${NC}"
  echo "   curl $DEPLOYED_URL/health"
  echo ""
fi

echo -e "${BLUE}🗄️  D1 数据库:${NC}"
echo "   $DB_NAME"
echo ""
echo -e "${BLUE}💾 R2 存储:${NC}"
echo "   $BUCKET_NAME"
echo ""
echo -e "${YELLOW}📝 接下来:${NC}"
echo "   1. 测试添加订阅"
echo "   2. 配置 GitHub Actions（如需自动下载）"
echo "   3. 部署 Frontend"
echo ""
