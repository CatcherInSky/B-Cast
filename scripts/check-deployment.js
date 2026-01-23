#!/usr/bin/env node
/**
 * 部署前检查脚本
 * 在执行 wrangler deploy 前自动运行
 */

const fs = require('fs');
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message, color = '') {
  console.log(`${color}${message}${colors.reset}`);
}

function checkWranglerToml() {
  const wranglerPath = path.join(__dirname, '..', 'backend', 'wrangler.toml');
  const content = fs.readFileSync(wranglerPath, 'utf-8');
  
  // 检查database_id是否已配置
  const dbMatch = content.match(/database_id = "([^"]*)"/);
  
  if (!dbMatch || !dbMatch[1]) {
    log('❌ 错误: backend/wrangler.toml 中的 database_id 未配置', colors.red);
    log('', colors.yellow);
    log('解决方法：', colors.yellow);
    log('  1. 运行自动初始化: npm run init', colors.yellow);
    log('  或', colors.yellow);
    log('  2. 手动创建D1并填入database_id', colors.yellow);
    log('', colors.yellow);
    process.exit(1);
  }
  
  log(`✅ database_id 已配置: ${dbMatch[1].substring(0, 20)}...`, colors.green);
  return true;
}

function checkEnvFiles() {
  // 检查前端环境变量
  const prodEnvPath = path.join(__dirname, '..', 'frontend', '.env.production');
  
  if (!fs.existsSync(prodEnvPath)) {
    log('⚠️  警告: frontend/.env.production 不存在', colors.yellow);
    log('   前端部署时需要配置 VITE_API_BASE', colors.yellow);
    return false;
  }
  
  const content = fs.readFileSync(prodEnvPath, 'utf-8');
  if (content.includes('your-subdomain')) {
    log('⚠️  警告: frontend/.env.production 使用的是示例配置', colors.yellow);
    log('   请更新 VITE_API_BASE 为实际的 Worker URL', colors.yellow);
    return false;
  }
  
  log('✅ 前端环境变量已配置', colors.green);
  return true;
}

function main() {
  log('\n🔍 部署前检查...', colors.blue);
  log('================================\n');
  
  const checks = [
    checkWranglerToml(),
    checkEnvFiles(),
  ];
  
  const allPassed = checks.every(Boolean);
  
  log('\n================================');
  if (allPassed) {
    log('✅ 所有检查通过，可以部署！', colors.green);
  } else {
    log('⚠️  部分检查未通过，但不影响部署', colors.yellow);
  }
  log('================================\n');
}

main();
