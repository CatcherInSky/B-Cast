#!/usr/bin/env node

/**
 * 初始化本地 D1 数据库
 * 在启动 wrangler dev --local 之前执行
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function loadEnv() {
  const envPath = join(rootDir, '.env');
  if (!existsSync(envPath)) {
    return {};
  }

  const content = readFileSync(envPath, 'utf8');
  const env = {};
  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').replace(/^["']|["']$/g, '');
        env[key.trim()] = value;
      }
    }
  });
  return env;
}

function main() {
  const env = loadEnv();
  const dbName = env.D1_DATABASE_NAME || 'b-cast';
  const initSqlPath = join(rootDir, 'scripts', 'init-db.sql');
  
  if (!existsSync(initSqlPath)) {
    log('⚠️  init-db.sql 文件不存在，跳过本地数据库初始化', 'yellow');
    return;
  }
  
  try {
    log('📋 初始化本地 D1 数据库...', 'blue');
    
    // 检查表是否已存在（幂等性检查）
    try {
      const checkResult = execSync(
        `cd backend && pnpm exec wrangler d1 execute ${dbName} --local --command "SELECT name FROM sqlite_master WHERE type='table' AND name='subscriptions';"`,
        { encoding: 'utf8', stdio: 'pipe' }
      );
      
      if (checkResult && checkResult.includes('subscriptions')) {
        log('✓ 本地数据库表已存在，跳过初始化', 'green');
        return;
      }
    } catch (e) {
      // 表不存在，继续初始化
    }
    
    // 执行初始化 SQL
    execSync(
      `cd backend && pnpm exec wrangler d1 execute ${dbName} --local --file=../scripts/init-db.sql`,
      { encoding: 'utf8', stdio: 'inherit' }
    );
    
    log('✓ 本地数据库初始化完成', 'green');
  } catch (error) {
    log('⚠️  本地数据库初始化失败，但继续启动服务', 'yellow');
    log(`   错误: ${error.message}`, 'yellow');
    log('   可以稍后手动运行: cd backend && pnpm exec wrangler d1 execute ' + dbName + ' --local --file=../scripts/init-db.sql', 'cyan');
  }
}

main();
