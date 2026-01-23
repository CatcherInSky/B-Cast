#!/usr/bin/env node
/**
 * B-Cast 一键部署脚本 (Node.js版本 - 跨平台)
 * 自动检查环境、构建、部署后端和前端
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  bright: '\x1b[1m',
};

function log(message, color = '') {
  console.log(`${color}${message}${colors.reset}`);
}

function exec(command, options = {}) {
  try {
    return execSync(command, {
      encoding: 'utf-8',
      stdio: options.silent ? 'pipe' : 'inherit',
      ...options
    });
  } catch (error) {
    if (!options.silent) throw error;
    return '';
  }
}

function commandExists(command) {
  try {
    exec(`${command} --version`, { silent: true });
    return true;
  } catch {
    return false;
  }
}

async function question(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
}

async function main() {
  log('\n🚀 B-Cast 一键部署', colors.blue + colors.bright);
  log('================================', colors.blue);
  log('');

  // 1. 检查必需工具
  log('📝 检查必需工具...', colors.blue);

  if (!commandExists('wrangler')) {
    log('❌ wrangler未安装', colors.red);
    log('   安装命令: npm install -g wrangler', colors.yellow);
    process.exit(1);
  }
  log('✅ wrangler 已安装', colors.green);

  if (!commandExists('node')) {
    log('❌ Node.js未安装', colors.red);
    process.exit(1);
  }
  log('✅ Node.js 已安装', colors.green);
  log('');

  // 2. 检查登录状态
  log('🔐 检查Cloudflare登录状态...', colors.blue);
  try {
    exec('wrangler whoami', { silent: true });
    log('✅ 已登录Cloudflare', colors.green);
  } catch {
    log('❌ 未登录Cloudflare', colors.red);
    log('   正在打开登录页面...', colors.yellow);
    exec('wrangler login');
  }
  log('');

  // 3. 运行初始化检查
  log('🔍 运行部署前检查...', colors.blue);
  try {
    exec('node scripts/check-deployment.js');
  } catch (error) {
    log('❌ 检查失败', colors.red);
    process.exit(1);
  }
  log('');

  // 4. 询问是否继续
  const answer = await question('是否继续部署？(y/n) ');
  if (answer.toLowerCase() !== 'y') {
    log('❌ 取消部署', colors.yellow);
    process.exit(0);
  }
  log('');

  // 5. 部署后端
  log('📦 部署后端 (Cloudflare Workers)...', colors.blue);
  process.chdir('backend');

  if (!fs.existsSync('node_modules')) {
    log('   安装依赖...', colors.yellow);
    exec('npm install');
  }

  log('   执行部署...', colors.yellow);
  try {
    exec('wrangler deploy');
    log('✅ 后端部署成功', colors.green);

    // 尝试获取Worker URL
    try {
      const deployments = exec('wrangler deployments list --json', { silent: true });
      const data = JSON.parse(deployments);
      if (data && data[0] && data[0].url) {
        const workerUrl = data[0].url;
        log(`   Worker URL: ${workerUrl}`, colors.blue);

        // 更新前端环境变量
        process.chdir('../frontend');
        const envPath = '.env.production';
        
        if (!fs.existsSync(envPath) || fs.readFileSync(envPath, 'utf-8').includes('your-subdomain')) {
          log('   自动更新前端环境变量...', colors.yellow);
          fs.writeFileSync(envPath, `VITE_API_BASE=${workerUrl}\n`);
          log('   已更新 frontend/.env.production', colors.green);
        }
        process.chdir('../backend');
      }
    } catch (err) {
      // 忽略获取URL失败
    }
  } catch (error) {
    log('❌ 后端部署失败', colors.red);
    process.exit(1);
  }

  process.chdir('..');
  log('');

  // 6. 部署前端
  log('🎨 部署前端 (Cloudflare Pages)...', colors.blue);
  process.chdir('frontend');

  if (!fs.existsSync('node_modules')) {
    log('   安装依赖...', colors.yellow);
    exec('npm install');
  }

  log('   构建前端...', colors.yellow);
  try {
    exec('npm run build');
    log('✅ 前端构建成功', colors.green);

    log('   部署到Cloudflare Pages...', colors.yellow);
    try {
      exec('wrangler pages deploy dist --project-name=b-cast-mvp');
      log('✅ 前端部署成功', colors.green);
    } catch (error) {
      log('❌ 前端部署失败', colors.red);
      log('   请检查 Cloudflare Pages 项目是否已创建', colors.yellow);
      process.exit(1);
    }
  } catch (error) {
    log('❌ 前端构建失败', colors.red);
    process.exit(1);
  }

  process.chdir('..');
  log('');

  // 7. 完成
  log('================================', colors.blue);
  log('🎉 部署完成！', colors.green + colors.bright);
  log('');
  log('📋 后续步骤：', colors.blue);
  log('   1. 检查Worker是否正常运行');
  log('   2. 检查Pages是否正常访问');
  log('   3. 配置GitHub Secrets（如果使用GitHub Actions）');
  log('   4. 测试完整功能流程');
  log('');
  log('   详见: docs/mvp-deployment-checklist.md', colors.blue);
  log('================================', colors.blue);
  log('');
}

main().catch(error => {
  log('\n❌ 部署失败', colors.red);
  log(`   ${error.message}`, colors.yellow);
  process.exit(1);
});
