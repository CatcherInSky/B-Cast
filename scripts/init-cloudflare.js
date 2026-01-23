#!/usr/bin/env node
/**
 * B-Cast Cloudflare 资源初始化脚本（跨平台）
 * 自动创建D1数据库和R2存储桶，并更新wrangler.toml
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message, color = '') {
  console.log(`${color}${message}${colors.reset}`);
}

function exec(command, silent = false) {
  try {
    return execSync(command, {
      encoding: 'utf-8',
      stdio: silent ? 'pipe' : 'inherit',
    });
  } catch (error) {
    if (!silent) throw error;
    return '';
  }
}

async function main() {
  log('\n🚀 B-Cast Cloudflare 资源初始化', colors.bright);
  log('================================', colors.bright);
  log('');

  // 检查wrangler
  log('📝 检查wrangler CLI...');
  try {
    exec('wrangler --version', true);
    log('✅ wrangler已安装', colors.green);
  } catch (error) {
    log('❌ wrangler未安装', colors.red);
    log('   请运行: npm install -g wrangler', colors.yellow);
    process.exit(1);
  }

  // 检查登录状态
  try {
    exec('wrangler whoami', true);
    log('✅ 已登录Cloudflare', colors.green);
  } catch (error) {
    log('❌ 未登录Cloudflare', colors.red);
    log('   请运行: wrangler login', colors.yellow);
    process.exit(1);
  }
  log('');

  // 创建D1数据库
  log('📦 创建D1数据库...');
  let databaseId = '';
  
  try {
    const output = exec('wrangler d1 create b-cast-mvp', true);
    const match = output.match(/database_id = "([^"]+)"/);
    
    if (match) {
      databaseId = match[1];
      log(`✅ 数据库创建成功`, colors.green);
    } else {
      throw new Error('无法从输出中提取database_id');
    }
  } catch (error) {
    log('⚠️  数据库可能已存在，尝试获取现有数据库...', colors.yellow);
    
    try {
      const listOutput = exec('wrangler d1 list', true);
      const lines = listOutput.split('\n');
      const dbLine = lines.find(line => line.includes('b-cast-mvp'));
      
      if (dbLine) {
        const parts = dbLine.trim().split(/\s+/);
        databaseId = parts[0];
        log(`✅ 找到现有数据库`, colors.green);
      }
    } catch (listError) {
      log('❌ 无法获取数据库ID', colors.red);
      process.exit(1);
    }
  }

  if (!databaseId) {
    log('❌ 无法获取数据库ID，请手动创建', colors.red);
    process.exit(1);
  }

  log(`   Database ID: ${databaseId}`, colors.blue);
  log('');

  // 初始化数据库表
  log('🗄️  初始化数据库表...');
  try {
    exec('wrangler d1 execute b-cast-mvp --file=./scripts/download_queue.sql');
    log('✅ 数据库表创建成功', colors.green);
  } catch (error) {
    log('⚠️  表可能已存在', colors.yellow);
  }
  log('');

  // 创建R2存储桶
  log('🪣 创建R2存储桶...');
  try {
    const r2Output = exec('wrangler r2 bucket create b-cast-audio', true);
    if (r2Output.includes('already exists') || r2Output.includes('Created')) {
      log('✅ R2存储桶已就绪', colors.green);
    } else {
      throw new Error('R2创建失败');
    }
  } catch (error) {
    if (error.message.includes('already exists')) {
      log('✅ R2存储桶已存在', colors.green);
    } else {
      log('❌ R2存储桶创建失败', colors.red);
      log(`   ${error.message}`, colors.yellow);
    }
  }
  log('');

  // 更新wrangler.toml
  log('📝 更新wrangler.toml...');
  const wranglerPath = path.join(__dirname, '..', 'backend', 'wrangler.toml');
  
  try {
    let content = fs.readFileSync(wranglerPath, 'utf-8');
    
    // 替换database_id
    content = content.replace(
      /database_id = ".*"/,
      `database_id = "${databaseId}"`
    );
    
    fs.writeFileSync(wranglerPath, content, 'utf-8');
    log('✅ wrangler.toml已更新', colors.green);
  } catch (error) {
    log('❌ 更新wrangler.toml失败', colors.red);
    log(`   ${error.message}`, colors.yellow);
    process.exit(1);
  }
  log('');

  // 显示总结
  log('================================', colors.bright);
  log('✅ 初始化完成！', colors.green + colors.bright);
  log('');
  log('📋 配置信息：', colors.bright);
  log(`   Database ID: ${databaseId}`);
  log(`   Database Name: b-cast-mvp`);
  log(`   R2 Bucket: b-cast-audio`);
  log('');
  log('📝 下一步：', colors.bright);
  log('   1. 配置R2公开访问（在Cloudflare Dashboard中）');
  log('   2. 创建R2 API Token');
  log('   3. 创建Cloudflare API Token');
  log('   4. 配置GitHub Secrets');
  log('');
  log('   详见: docs/mvp-deployment-checklist.md', colors.blue);
  log('================================', colors.bright);
  log('');
}

main().catch(error => {
  log('\n❌ 初始化失败', colors.red);
  log(`   ${error.message}`, colors.yellow);
  process.exit(1);
});
