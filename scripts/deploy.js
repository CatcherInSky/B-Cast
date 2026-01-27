#!/usr/bin/env node

/**
 * B-Cast 部署脚本
 * 根据 docs/MVP.md 实现
 */

import { execSync, spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function exec(command, options = {}) {
  try {
    return execSync(command, { 
      encoding: 'utf8', 
      cwd: rootDir,
      stdio: options.silent ? 'pipe' : 'inherit',
      ...options 
    });
  } catch (error) {
    if (!options.silent) {
      throw error;
    }
    return null;
  }
}

function loadEnv() {
  const envPath = join(rootDir, '.env');
  if (!existsSync(envPath)) {
    return null;
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

function saveEnv(env) {
  const envPath = join(rootDir, '.env');
  const lines = Object.entries(env).map(([key, value]) => {
    return `${key}="${value}"`;
  });
  writeFileSync(envPath, lines.join('\n') + '\n');
}

function validateEnv(env) {
  const required = ['D1_DATABASE_NAME', 'D1_DATABASE_ID', 'R2_BUCKET_NAME'];
  const missing = required.filter(key => !env[key] || env[key].trim() === '');
  
  if (missing.length > 0) {
    log(`❌ 缺少必需的配置: ${missing.join(', ')}`, 'red');
    log('   请运行 pnpm init 进行初始化', 'yellow');
    return false;
  }
  
  return true;
}

async function checkWranglerLogin() {
  log('\n📋 检查 wrangler 登录状态...', 'blue');
  
  try {
    exec('cd backend && pnpm exec wrangler whoami', { silent: true });
    log('✓ wrangler 已登录', 'green');
    return true;
  } catch (error) {
    log('⚠️  wrangler 未登录，正在执行登录...', 'yellow');
    try {
      exec('cd backend && pnpm exec wrangler login');
      log('✓ wrangler 登录成功', 'green');
      return true;
    } catch (loginError) {
      log('❌ wrangler 登录失败', 'red');
      throw loginError;
    }
  }
}

function generateWranglerToml(env) {
  log('\n📝 生成/更新 wrangler.toml...', 'blue');
  
  const wranglerPath = join(rootDir, 'backend', 'wrangler.toml');
  const dbName = env.D1_DATABASE_NAME;
  const dbId = env.D1_DATABASE_ID;
  const bucketName = env.R2_BUCKET_NAME;
  const workerUrl = env.WORKER_URL || '';
  
  const content = `name = "b-cast"
main = "src/index.ts"
compatibility_date = "2024-01-01"

# D1 Database binding
[[d1_databases]]
binding = "DB"
database_name = "${dbName}"
database_id = "${dbId}"

# R2 Storage binding
[[r2_buckets]]
binding = "BUCKET"
bucket_name = "${bucketName}"

# Cron Triggers
[triggers]
crons = ["0 2 * * *"]

# Environment variables
[vars]
WORKER_URL = "${workerUrl}"
`;
  
  writeFileSync(wranglerPath, content);
  log('✓ wrangler.toml 已生成', 'green');
}

function deployBackend(env) {
  log('\n🚀 部署后端到 Cloudflare Workers...', 'blue');
  
  return new Promise((resolve, reject) => {
    // 从 wrangler.toml 读取 worker name
    const wranglerPath = join(rootDir, 'backend', 'wrangler.toml');
    let workerName = 'b-cast'; // 默认值
    
    if (existsSync(wranglerPath)) {
      const wranglerContent = readFileSync(wranglerPath, 'utf8');
      const nameMatch = wranglerContent.match(/^name\s*=\s*["']?([^"'\n]+)["']?/m);
      if (nameMatch) {
        workerName = nameMatch[1].trim();
      }
    }
    
    // 使用 spawn 来同时显示输出和捕获 URL
    const deployProcess = spawn('pnpm', ['exec', 'wrangler', 'deploy'], {
      cwd: join(rootDir, 'backend'),
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: true
    });
    
    let output = '';
    let errorOutput = '';
    
    deployProcess.stdout.on('data', (data) => {
      const text = data.toString();
      process.stdout.write(text); // 显示到控制台
      output += text;
    });
    
    deployProcess.stderr.on('data', (data) => {
      const text = data.toString();
      process.stderr.write(text); // 显示到控制台
      errorOutput += text;
    });
    
    deployProcess.on('close', (code) => {
      if (code !== 0) {
        log('❌ 后端部署失败', 'red');
        reject(new Error(`部署失败，退出码: ${code}`));
        return;
      }
      
      // 尝试从输出中提取 URL
      let workerUrl = null;
      const allOutput = output + errorOutput;
      
      // 方法1: 从部署输出中提取
      const urlMatch = allOutput.match(/https:\/\/([^\s]+\.workers\.dev)/);
      if (urlMatch) {
        workerUrl = urlMatch[1];
      }
      
      // 方法2: 如果方法1失败，从 deployments list 获取
      if (!workerUrl) {
        try {
          const deploymentsOutput = exec('cd backend && pnpm exec wrangler deployments list', { silent: true });
          if (deploymentsOutput) {
            const lines = deploymentsOutput.split('\n');
            for (const line of lines) {
              const match = line.match(/https:\/\/([^\s]+\.workers\.dev)/);
              if (match && line.includes(workerName)) {
                workerUrl = match[1];
                break;
              }
            }
          }
        } catch (e) {
          // 忽略错误
        }
      }
      
      // 方法3: 如果都失败，使用默认格式
      if (!workerUrl) {
        workerUrl = `${workerName}.workers.dev`;
        log('⚠️  无法自动检测 Worker URL，使用默认格式', 'yellow');
      }
      
      log(`✓ 后端部署成功`, 'green');
      log(`  Worker URL: ${workerUrl}`, 'cyan');
      
      // 如果 .env 中的 WORKER_URL 为空，自动更新
      if (!env.WORKER_URL || env.WORKER_URL.trim() === '') {
        env.WORKER_URL = workerUrl;
        saveEnv(env);
        log('✓ 已自动更新 .env 文件中的 WORKER_URL', 'green');
      } else if (env.WORKER_URL !== workerUrl) {
        log(`  ℹ️  当前 .env 中的 WORKER_URL: ${env.WORKER_URL}`, 'cyan');
        log(`  ℹ️  检测到的 Worker URL: ${workerUrl}`, 'cyan');
        log(`  ⚠️  如果检测到的 URL 不正确，请手动更新 .env 文件`, 'yellow');
      }
      
      resolve(workerUrl);
    });
    
    deployProcess.on('error', (error) => {
      log('❌ 后端部署失败', 'red');
      reject(error);
    });
  });
}

function buildFrontend() {
  log('\n📦 构建前端...', 'blue');
  
  try {
    exec('cd frontend && npm run build');
    log('✓ 前端构建完成', 'green');
  } catch (error) {
    log('❌ 前端构建失败', 'red');
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const skipFrontend = args.includes('--skip-frontend');
  const skipBackend = args.includes('--skip-backend');
  const dryRun = args.includes('--dry-run');
  
  log('╔════════════════════════════════════════╗', 'blue');
  log('║     B-Cast 部署脚本                   ║', 'blue');
  log('╚════════════════════════════════════════╝', 'blue');
  
  if (dryRun) {
    log('\n🔍 干运行模式（仅验证，不实际部署）', 'yellow');
  }
  
  // 1. 检查 .env 文件
  log('\n📋 检查配置...', 'blue');
  const env = loadEnv();
  
  if (!env) {
    log('❌ .env 文件不存在', 'red');
    log('   请运行 pnpm init 进行初始化', 'yellow');
    process.exit(1);
  }
  
  // 2. 验证配置
  if (!validateEnv(env)) {
    process.exit(1);
  }
  
  log('✓ 配置验证通过', 'green');
  
  if (dryRun) {
    log('\n✓ 干运行完成，配置验证通过', 'green');
    return;
  }
  
  // 3. 检查 wrangler 登录状态
  checkWranglerLogin();
  
  // 4. 生成/更新 wrangler.toml
  generateWranglerToml(env);
  
  // 5. 部署后端
  let workerUrl = null;
  if (!skipBackend) {
    workerUrl = await deployBackend(env);
  } else {
    log('\n⚠️  跳过后端部署 (--skip-backend)', 'yellow');
  }
  
  // 6. 构建前端
  if (!skipFrontend) {
    buildFrontend();
    log('\n📝 前端构建完成，可以手动部署到静态托管服务:', 'yellow');
    log('   - GitHub Pages: 通过 GitHub Actions 自动部署', 'cyan');
    log('   - Cloudflare Pages: 手动上传 frontend/dist 目录', 'cyan');
    log('   - Vercel: 手动上传 frontend/dist 目录', 'cyan');
  } else {
    log('\n⚠️  跳过前端构建 (--skip-frontend)', 'yellow');
  }
  
  // 7. 完成
  log('\n╔════════════════════════════════════════╗', 'green');
  log('║     🎉 部署完成！                     ║', 'green');
  log('╚════════════════════════════════════════╝', 'green');
  
  if (workerUrl) {
    log('\n📡 Worker URL:', 'blue');
    log(`   https://${workerUrl}`, 'cyan');
    log('\n📝 测试部署:', 'blue');
    log(`   curl https://${workerUrl}/health`, 'cyan');
  }
  
  log('\n📋 下一步:', 'blue');
  log('   1. 测试添加订阅', 'cyan');
  log('   2. 配置 GitHub Actions（如需自动下载）', 'cyan');
  log('   3. 部署前端到静态托管服务', 'cyan');
  log('');
}

main().catch((error) => {
  log(`\n❌ 部署失败: ${error.message}`, 'red');
  process.exit(1);
});
