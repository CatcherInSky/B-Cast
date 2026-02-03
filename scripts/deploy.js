#!/usr/bin/env node

/**
 * B-Cast 部署脚本
 * 根据 docs/MVP.md 实现
 */

import { execSync, spawn, spawnSync } from 'child_process';
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
  const githubRepo = (env.GITHUB_REPO || '').trim();
  
  const content = `name = "b-cast"
main = "src/index.ts"
compatibility_date = "2024-01-01"

# 静态资源：前端构建产物与 Worker 一起部署（同域，无需 CORS）
[assets]
directory = "../frontend/dist"
not_found_handling = "single-page-application"
binding = "ASSETS"
run_worker_first = ["/api/*", "/health"]

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
GITHUB_REPO = "${githubRepo}"
`;
  
  writeFileSync(wranglerPath, content);
  log('✓ wrangler.toml 已生成（含 assets 同域部署）', 'green');
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

function buildFrontend(apiBaseForBuild) {
  log('\n📦 构建前端...', 'blue');
  
  // 与 Worker 同域部署时用空字符串（相对路径 /api）；单独部署前端时需传 Worker URL
  const apiBase = apiBaseForBuild
    ? (apiBaseForBuild.startsWith('http') ? apiBaseForBuild : `https://${apiBaseForBuild}`)
    : '';
  if (apiBase) {
    log(`  VITE_API_BASE=${apiBase}（前端单独部署时使用）`, 'cyan');
  } else {
    log('  VITE_API_BASE=空（与 Worker 同域，使用相对路径 /api）', 'cyan');
  }
  
  try {
    const buildEnv = { ...process.env, VITE_API_BASE: apiBase };
    execSync('npm run build', {
      cwd: join(rootDir, 'frontend'),
      encoding: 'utf8',
      stdio: 'inherit',
      env: buildEnv
    });
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
  
  // 检查触发下载所需配置，缺则提示（不阻断部署）
  if (!env.GITHUB_REPO || !env.GITHUB_REPO.trim()) {
    log('⚠️  GITHUB_REPO 未配置，访问 /api/downloads/trigger-download 触发下载将不可用', 'yellow');
    log('   init 会根据 git 自动写入，或请在 .env 中添加 GITHUB_REPO=owner/repo', 'yellow');
  }
  if (!env.GITHUB_TOKEN || !env.GITHUB_TOKEN.trim()) {
    log('⚠️  GITHUB_TOKEN 未配置，无法通过 Worker 链接触发下载', 'yellow');
    log('   请见 README：创建 GitHub PAT（勾选 actions: write）并写入 .env', 'yellow');
  }
  
  if (dryRun) {
    log('\n✓ 干运行完成，配置验证通过', 'green');
    return;
  }
  
  // 3. 检查 wrangler 登录状态
  checkWranglerLogin();
  
  // 4. 生成/更新 wrangler.toml（含 assets 配置时需先有 frontend/dist）
  generateWranglerToml(env);
  
  // 5. 先构建前端（与 Worker 同域部署时用空 API_BASE；仅跳过后端时用 Worker URL 供单独部署）
  if (!skipFrontend) {
    const sameOrigin = !skipBackend;
    buildFrontend(sameOrigin ? '' : (env.WORKER_URL || ''));
  } else {
    log('\n⚠️  跳过前端构建 (--skip-frontend)', 'yellow');
  }
  
  // 6. 部署后端（Worker + 静态资源一起上传）
  let workerUrl = null;
  if (!skipBackend) {
    workerUrl = await deployBackend(env);
    if (!skipFrontend) {
      log('\n📝 前端已随 Worker 一起部署，访问同一域名即可使用', 'green');
    }
    // 若 .env 中有 GITHUB_TOKEN，写入 Worker 的 secret，供 /api/downloads/trigger-download 使用
    if (env.GITHUB_TOKEN && env.GITHUB_TOKEN.trim()) {
      log('\n📤 写入 Worker secret GITHUB_TOKEN...', 'blue');
      const result = spawnSync('pnpm', ['exec', 'wrangler', 'secret', 'put', 'GITHUB_TOKEN'], {
        cwd: join(rootDir, 'backend'),
        input: env.GITHUB_TOKEN,
        stdio: ['pipe', 'inherit', 'inherit'],
      });
      if (result.status === 0) {
        log('✓ GITHUB_TOKEN 已写入 Worker', 'green');
      } else {
        log('⚠️  写入 GITHUB_TOKEN 失败（可能需先 wrangler login），可稍后手动运行: cd backend && echo "你的token" | pnpm exec wrangler secret put GITHUB_TOKEN', 'yellow');
      }
    }
  } else {
    log('\n⚠️  跳过后端部署 (--skip-backend)', 'yellow');
    if (!skipFrontend) {
      log('📝 前端已构建，可手动部署 frontend/dist 到静态托管', 'cyan');
    }
  }
  
  // 7. 完成
  log('\n╔════════════════════════════════════════╗', 'green');
  log('║     🎉 部署完成！                     ║', 'green');
  log('╚════════════════════════════════════════╝', 'green');
  
  if (workerUrl) {
    log('\n📡 Worker URL（请务必带 https:// 访问）:', 'blue');
    log(`   https://${workerUrl}`, 'cyan');
    log('\n📝 本地测试:', 'blue');
    log(`   curl https://${workerUrl}/health`, 'cyan');
    log('\n⚠️  若浏览器连接超时:', 'yellow');
    log('   - 确认使用 https:// 而不是 http://', 'cyan');
    log('   - 国内网络可能无法访问 workers.dev，可换网络/VPN 或绑定自定义域名', 'cyan');
    log('   - 详见 docs/DEPLOY-TROUBLESHOOTING.md', 'cyan');
  }
  
  log('\n📋 下一步:', 'blue');
  log('   1. 在浏览器打开 https://' + (workerUrl || '你的Worker') + ' 测试', 'cyan');
  log('   2. 配置 GitHub Actions（如需自动下载）', 'cyan');
  log('   3. 部署前端到静态托管服务', 'cyan');
  log('');
}

main().catch((error) => {
  log(`\n❌ 部署失败: ${error.message}`, 'red');
  process.exit(1);
});
