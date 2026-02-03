#!/usr/bin/env node

/**
 * B-Cast 初始化脚本
 * 根据 docs/MVP.md 实现
 */

import { execSync, spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import readline from 'readline';

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
    const result = execSync(command, { 
      encoding: 'utf8', 
      cwd: rootDir,
      stdio: options.silent ? 'pipe' : 'inherit',
      ...options 
    });
    // 如果 silent 为 false，输出已经显示到控制台，但返回 null
    // 如果 silent 为 true，返回捕获的输出
    return options.silent ? result : result || '';
  } catch (error) {
    if (!options.silent) {
      // 如果 silent 为 false，错误已经显示，但我们需要捕获输出
      // 重新执行以捕获输出
      try {
        return execSync(command, { 
          encoding: 'utf8', 
          cwd: rootDir,
          stdio: 'pipe',
          ...options 
        });
      } catch (retryError) {
        // 如果重试也失败，返回错误输出
        return retryError.stdout || '';
      }
    }
    return null;
  }
}

function question(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
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

function saveEnv(env) {
  const envPath = join(rootDir, '.env');
  const lines = Object.entries(env).map(([key, value]) => {
    return `${key}="${value}"`;
  });
  writeFileSync(envPath, lines.join('\n') + '\n');
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

function getDatabaseIdFromList(dbName) {
  try {
    const listOutput = exec('cd backend && pnpm exec wrangler d1 list', { silent: true });
    if (!listOutput) {
      return null;
    }
    
    // 尝试解析 JSON 格式（如果 wrangler 输出 JSON）
    try {
      const json = JSON.parse(listOutput);
      if (Array.isArray(json)) {
        const db = json.find(d => d.name === dbName || d.database_name === dbName);
        if (db) {
          return db.database_id || db.id || null;
        }
      }
    } catch (e) {
      // 不是 JSON，继续尝试文本解析
    }
    
    // 解析文本格式
    const lines = listOutput.split('\n');
    for (const line of lines) {
      // 查找包含数据库名称的行
      if (line.includes(dbName)) {
        // 尝试多种格式提取 UUID
        // 格式1: database_id = "xxx"
        let match = line.match(/database_id\s*[=:]\s*"?([a-f0-9-]{36})"?/i);
        if (match) {
          return match[1];
        }
        // 格式2: 行中包含 UUID
        match = line.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
        if (match) {
          return match[1];
        }
      }
    }
    
    return null;
  } catch (e) {
    return null;
  }
}

async function createD1Database() {
  log('\n🗄️  创建 D1 数据库...', 'blue');
  
  const answer = await question('请输入 D1 数据库名称 (直接回车使用默认值 "b-cast"): ');
  const dbName = answer.trim() || 'b-cast';
  
  // 先检查数据库是否已存在
  log(`检查数据库是否已存在: ${dbName}...`, 'cyan');
  const existingId = getDatabaseIdFromList(dbName);
  if (existingId) {
    log(`✓ 数据库已存在: ${existingId}`, 'green');
    return { name: dbName, id: existingId };
  }
  
  log(`创建新数据库: ${dbName}...`, 'cyan');
  
  try {
    // 使用 spawn 来同时显示输出和捕获结果
    return new Promise((resolve, reject) => {
      let output = '';
      
      const child = spawn('pnpm', ['exec', 'wrangler', 'd1', 'create', dbName], {
        cwd: join(rootDir, 'backend'),
        stdio: ['inherit', 'pipe', 'inherit'],
        shell: true
      });
      
      child.stdout.on('data', (data) => {
        const text = data.toString();
        process.stdout.write(text); // 显示输出
        output += text; // 同时捕获
      });
      
      child.on('close', (code) => {
        if (code !== 0) {
          // 如果创建失败，可能是数据库已存在，尝试从列表获取
          log('⚠️  数据库创建失败，尝试从列表获取...', 'yellow');
          const dbId = getDatabaseIdFromList(dbName);
          if (dbId) {
            log(`✓ 找到已存在的数据库: ${dbId}`, 'green');
            resolve({ name: dbName, id: dbId });
            return;
          }
          reject(new Error(`数据库创建失败，退出码: ${code}。如果数据库已存在，请手动从 wrangler d1 list 的输出中获取 database_id`));
          return;
        }
        
        // 提取 database_id
        const match = output.match(/database_id\s*=\s*"([^"]+)"/);
        if (!match) {
          // 尝试其他可能的格式
          const altMatch = output.match(/database_id[^"]*"([a-f0-9-]{36})"/i);
          if (altMatch) {
            const databaseId = altMatch[1];
            log(`✓ 数据库创建成功: ${databaseId}`, 'green');
            resolve({ name: dbName, id: databaseId });
            return;
          }
          
          // 如果还是找不到，尝试从列表获取
          log('⚠️  无法从输出中提取 database_id，尝试从列表获取...', 'yellow');
          const dbId = getDatabaseIdFromList(dbName);
          if (dbId) {
            log(`✓ 从列表获取到 database_id: ${dbId}`, 'green');
            resolve({ name: dbName, id: dbId });
            return;
          }
          
          reject(new Error('无法从输出中提取 database_id，请手动从上面的输出中复制并更新 .env 文件'));
        } else {
          const databaseId = match[1];
          log(`✓ 数据库创建成功: ${databaseId}`, 'green');
          resolve({ name: dbName, id: databaseId });
        }
      });
      
      child.on('error', (error) => {
        reject(error);
      });
    });
  } catch (error) {
    log('❌ 数据库创建失败', 'red');
    log(`   错误: ${error.message}`, 'yellow');
    log('   请手动从上面的输出中复制 database_id 并更新 .env 文件', 'yellow');
    throw error;
  }
}

function checkR2BucketExists(bucketName) {
  try {
    const listOutput = exec('cd backend && pnpm exec wrangler r2 bucket list', { silent: true });
    if (!listOutput) {
      return false;
    }
    
    // 尝试解析 JSON 格式（如果 wrangler 输出 JSON）
    try {
      const json = JSON.parse(listOutput);
      if (Array.isArray(json)) {
        return json.some(b => b.name === bucketName || b.bucket_name === bucketName);
      }
    } catch (e) {
      // 不是 JSON，继续尝试文本解析
    }
    
    // 解析文本格式
    const lines = listOutput.split('\n');
    for (const line of lines) {
      // 查找包含 bucket 名称的行
      if (line.includes(bucketName)) {
        return true;
      }
    }
    
    return false;
  } catch (e) {
    return false;
  }
}

async function createR2Bucket() {
  log('\n🪣 创建 R2 Bucket...', 'blue');
  
  const answer = await question('请输入 R2 Bucket 名称 (直接回车使用默认值 "b-cast"): ');
  const bucketName = answer.trim() || 'b-cast';
  
  // 先检查 bucket 是否已存在
  log(`检查 R2 Bucket 是否已存在: ${bucketName}...`, 'cyan');
  if (checkR2BucketExists(bucketName)) {
    log(`✓ R2 Bucket 已存在: ${bucketName}`, 'green');
    return bucketName;
  }
  
  log(`创建新 R2 Bucket: ${bucketName}...`, 'cyan');
  
  try {
    exec('cd backend && pnpm exec wrangler r2 bucket create ' + bucketName);
    log(`✓ R2 Bucket 创建成功: ${bucketName}`, 'green');
    
    // 验证 bucket 是否存在
    if (checkR2BucketExists(bucketName)) {
      log(`✓ 已验证 bucket 存在`, 'green');
    } else {
      log('⚠️  无法验证 bucket，但创建命令已成功执行', 'yellow');
    }
    
    return bucketName;
  } catch (error) {
    // 如果创建失败，可能是 bucket 已存在（并发创建或其他原因）
    if (error.message && error.message.includes('already exists')) {
      log('⚠️  Bucket 已存在（可能由其他进程创建）', 'yellow');
      if (checkR2BucketExists(bucketName)) {
        log(`✓ 已验证 bucket 存在: ${bucketName}`, 'green');
        return bucketName;
      }
    }
    
    log('⚠️  wrangler 命令不可用或失败', 'yellow');
    log('   请手动在 Cloudflare Dashboard 中创建 R2 bucket:', 'yellow');
    log('   1. 访问 https://dash.cloudflare.com/', 'yellow');
    log('   2. 进入 R2 → Create bucket', 'yellow');
    log('   3. 创建后验证: wrangler r2 bucket list', 'yellow');
    
    // 再次检查是否已存在（可能用户手动创建了）
    if (checkR2BucketExists(bucketName)) {
      log(`✓ 检测到 bucket 已存在: ${bucketName}`, 'green');
      return bucketName;
    }
    
    const confirm = await question('是否已在 Dashboard 中创建 bucket？(y/n): ');
    if (confirm.toLowerCase() !== 'y') {
      throw new Error('请先创建 R2 bucket');
    }
    
    // 最后验证一次
    if (checkR2BucketExists(bucketName)) {
      log(`✓ 已验证 bucket 存在: ${bucketName}`, 'green');
      return bucketName;
    }
    
    return bucketName;
  }
}

function initRemoteDatabase(dbName) {
  log('\n🗄️  初始化远程数据库...', 'blue');
  
  const initSqlPath = join(rootDir, 'scripts', 'init-db.sql');
  if (!existsSync(initSqlPath)) {
    log('⚠️  init-db.sql 文件不存在，跳过数据库初始化', 'yellow');
    return;
  }
  
  try {
    // 使用 --yes 参数自动确认，避免交互式询问
    exec(`cd backend && pnpm exec wrangler d1 execute ${dbName} --remote --file=../scripts/init-db.sql --yes`);
    log('✓ 远程数据库初始化完成', 'green');
  } catch (error) {
    log('❌ 远程数据库初始化失败', 'red');
    throw error;
  }
}

function installDependencies() {
  log('\n📦 安装依赖...', 'blue');
  
  try {
    // 先安装根目录依赖（如果需要）
    if (existsSync(join(rootDir, 'package.json'))) {
      log('检查根目录依赖...', 'cyan');
      try {
        // 检查是否已安装
        if (!existsSync(join(rootDir, 'node_modules'))) {
          log('安装根目录依赖...', 'cyan');
          exec('pnpm install', { silent: false });
        } else {
          log('✓ 根目录依赖已安装', 'green');
        }
      } catch (e) {
        log('⚠️  根目录依赖安装失败，继续安装前后端依赖...', 'yellow');
      }
    }
    
    log('安装后端依赖...', 'cyan');
    exec('cd backend && pnpm install');
    
    log('安装前端依赖...', 'cyan');
    exec('cd frontend && npm install');
    
    log('✓ 依赖安装完成', 'green');
  } catch (error) {
    log('❌ 依赖安装失败', 'red');
    log(`   错误: ${error.message}`, 'yellow');
    log('   可以稍后手动运行: pnpm install && cd backend && pnpm install && cd ../frontend && npm install', 'yellow');
    throw error;
  }
}

async function deployWorker(env) {
  log('\n🚀 部署 Worker...', 'blue');
  log('   正在部署 Worker 以获取 URL（必需步骤）...', 'cyan');
  
  try {
    // 生成 wrangler.toml
    generateWranglerToml(env);
    
    log('部署中...', 'cyan');
    
    // 使用 spawn 来同时显示输出和捕获结果
    return new Promise((resolve, reject) => {
      let output = '';
      let deploymentSuccess = false;
      
      const child = spawn('pnpm', ['exec', 'wrangler', 'deploy'], {
        cwd: join(rootDir, 'backend'),
        stdio: ['inherit', 'pipe', 'inherit'],
        shell: true
      });
      
      child.stdout.on('data', (data) => {
        const text = data.toString();
        process.stdout.write(text); // 显示输出
        output += text; // 同时捕获
      });
      
      child.on('close', (code) => {
        if (code !== 0) {
          // 即使出现错误，也可能已经成功上传
          if (output.includes('Uploaded') || output.includes('uploaded')) {
            log('⚠️  部署过程中出现警告，但 Worker 可能已成功上传', 'yellow');
            deploymentSuccess = true;
          } else {
            reject(new Error(`部署失败，退出码: ${code}`));
            return;
          }
        } else {
          deploymentSuccess = true;
        }
        
        // 提取 Worker URL（多种方式尝试）
        let workerUrl = null;
        
        // 方式1: 从输出中提取完整 URL
        let urlMatch = output.match(/https:\/\/([^\s]+\.workers\.dev)/);
        if (urlMatch) {
          workerUrl = urlMatch[1]; // 不包含 https://
        } else {
          // 方式2: 尝试其他可能的格式
          urlMatch = output.match(/https:\/\/([a-zA-Z0-9-]+\.workers\.dev)/);
          if (urlMatch) {
            workerUrl = urlMatch[1];
          } else {
            // 方式3: 尝试从 wrangler.toml 中的 name 和账户信息推断
            // 需要从 wrangler whoami 获取账户信息
            try {
              const whoamiOutput = exec('cd backend && pnpm exec wrangler whoami', { silent: true });
              if (whoamiOutput) {
                // 尝试从 whoami 输出中提取子域名或账户ID
                // wrangler whoami 可能输出邮箱或账户信息
                const emailMatch = whoamiOutput.match(/([^@\s]+)@/);
                if (emailMatch) {
                  const username = emailMatch[1].replace(/[^a-zA-Z0-9]/g, '');
                  // 从 wrangler.toml 读取 name
                  const wranglerTomlPath = join(rootDir, 'backend', 'wrangler.toml');
                  let workerName = 'b-cast';
                  if (existsSync(wranglerTomlPath)) {
                    const tomlContent = readFileSync(wranglerTomlPath, 'utf8');
                    const nameMatch = tomlContent.match(/name\s*=\s*"([^"]+)"/);
                    if (nameMatch) {
                      workerName = nameMatch[1];
                    }
                  }
                  // 尝试常见的 URL 格式: {name}.{subdomain}.workers.dev
                  workerUrl = `${workerName}.${username}.workers.dev`;
                  log(`⚠️  尝试推断 Worker URL: ${workerUrl}`, 'yellow');
                  log('   如果此 URL 不正确，请手动从 Cloudflare Dashboard 获取', 'yellow');
                }
              }
            } catch (e) {
              // 忽略错误
            }
          }
        }
        
        if (workerUrl) {
          log(`✓ Worker 部署成功: ${workerUrl}`, 'green');
          if (!deploymentSuccess) {
            log('   注意: 部署过程中有警告，但 Worker 已成功上传', 'yellow');
          }
          log('   可以访问 https://' + workerUrl + '/health 验证', 'cyan');
          resolve(workerUrl);
        } else {
          // 最后尝试：从 deployments list 获取
          log('⚠️  无法从输出中提取 Worker URL，尝试从部署列表获取...', 'yellow');
          try {
            const deploymentsOutput = exec('cd backend && pnpm exec wrangler deployments list', { silent: true });
            if (deploymentsOutput) {
              // 尝试从部署列表中提取最新的 URL
              const latestUrlMatch = deploymentsOutput.match(/https:\/\/([^\s]+\.workers\.dev)/);
              if (latestUrlMatch) {
                workerUrl = latestUrlMatch[1];
                log(`✓ 从部署列表获取到 Worker URL: ${workerUrl}`, 'green');
                resolve(workerUrl);
                return;
              }
            }
          } catch (e) {
            // 忽略错误
          }
          
          log('⚠️  无法自动获取 Worker URL', 'yellow');
          log('   请手动从以下方式之一获取:', 'yellow');
          log('   1. Cloudflare Dashboard: https://dash.cloudflare.com/ → Workers & Pages', 'cyan');
          log('   2. 运行: cd backend && pnpm exec wrangler deployments list', 'cyan');
          log('   3. 或稍后运行 pnpm deploy 时会自动获取', 'cyan');
          resolve(null);
        }
      });
      
      child.on('error', (error) => {
        reject(error);
      });
    });
  } catch (error) {
    log('❌ Worker 部署失败', 'red');
    log(`   错误: ${error.message}`, 'yellow');
    log('   如果 Worker 实际上已成功上传，可以手动从 Cloudflare Dashboard 获取 URL', 'yellow');
    throw error;
  }
}

function generateWranglerToml(env) {
  const wranglerPath = join(rootDir, 'backend', 'wrangler.toml');
  const dbName = env.D1_DATABASE_NAME || 'b-cast';
  const dbId = env.D1_DATABASE_ID || '';
  const bucketName = env.R2_BUCKET_NAME || 'b-cast';
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
GITHUB_REPO = "${env.GITHUB_REPO || ''}"
`;
  
  writeFileSync(wranglerPath, content);
}

/** 从 git remote origin 解析出 owner/repo，失败返回 null */
function getGitHubRepoFromRemote() {
  try {
    const url = exec('git remote get-url origin', { silent: true });
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.trim();
    // https://github.com/owner/repo.git 或 git@github.com:owner/repo.git
    const m = trimmed.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/i);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function printGitHubSecretsInfo(env) {
  log('\n📝 GitHub Secrets 配置提示:', 'blue');
  log('════════════════════════════════════════', 'blue');
  log('请在 GitHub Repository Settings → Secrets and variables → Actions 中配置以下变量:', 'yellow');
  log('');
  log('必需（部署 Worker）:', 'cyan');
  log('  - CLOUDFLARE_API_TOKEN');
  log('    获取方式: https://dash.cloudflare.com/profile/api-tokens');
  log('    权限: Account.Cloudflare Workers:Edit, Account.Workers Scripts:Edit, Account.Workers KV Storage:Edit, Account.D1:Edit, Account.R2:Edit');
  log('');
  log('  - CLOUDFLARE_ACCOUNT_ID');
  log('    获取方式: https://dash.cloudflare.com/ → 右侧栏显示 Account ID');
  log('');
  log(`  - D1_DATABASE_NAME = "${env.D1_DATABASE_NAME || 'b-cast'}"`);
  log(`  - D1_DATABASE_ID = "${env.D1_DATABASE_ID || ''}"`);
  log(`  - R2_BUCKET_NAME = "${env.R2_BUCKET_NAME || 'b-cast'}"`);
  log('');
  log('可选（下载功能 / 触发下载）:', 'cyan');
  log(`  - WORKER_URL = "${env.WORKER_URL || ''}"`);
  log(`  - GITHUB_REPO = "${env.GITHUB_REPO || ''}"（init 已根据 git 写入 .env）`);
  log('  - GITHUB_TOKEN：需在 GitHub 创建 PAT（勾选 actions: write），见 README');
  log('');
  log('════════════════════════════════════════', 'blue');
}

async function main() {
  const args = process.argv.slice(2);
  const installDeps = args.includes('--install-deps'); // 改为需要显式指定才安装
  const skipDbInit = args.includes('--skip-db-init');
  
  log('╔════════════════════════════════════════╗', 'blue');
  log('║     B-Cast 初始化脚本                 ║', 'blue');
  log('╚════════════════════════════════════════╝', 'blue');
  
  // 1. 检查 wrangler 登录状态
  await checkWranglerLogin();
  
  // 2. 创建 D1 数据库
  const db = await createD1Database();
  
  // 3. 创建 R2 bucket
  const bucketName = await createR2Bucket();
  
  // 4. 提示 R2 公开访问配置
  log('\n⚠️  重要提示:', 'yellow');
  log('   请在 Cloudflare Dashboard 中配置 R2 公开访问（可选，用于直接访问 RSS 和音频文件）:', 'yellow');
  log('   1. 访问 https://dash.cloudflare.com/', 'yellow');
  log('   2. 进入 R2 → ' + bucketName + ' → Settings', 'yellow');
  log('   3. 在 Public Access 部分点击 Allow Access', 'yellow');
  
  // 5. 保存配置到 .env
  const env = loadEnv();
  env.D1_DATABASE_NAME = db.name;
  env.D1_DATABASE_ID = db.id;
  env.R2_BUCKET_NAME = bucketName;
  if (!env.WORKER_URL) {
    env.WORKER_URL = '';
  }
  saveEnv(env);
  log('\n✓ 配置已保存到 .env 文件', 'green');
  
  // 5b. GITHUB_REPO（用于「访问链接即触发下载」）：根据 git remote 自动写入，或询问
  if (!env.GITHUB_REPO || !env.GITHUB_REPO.trim()) {
    const fromGit = getGitHubRepoFromRemote();
    if (fromGit) {
      env.GITHUB_REPO = fromGit;
      saveEnv(env);
      log(`✓ 已根据 git remote 写入 GITHUB_REPO=${fromGit}`, 'green');
    } else {
      const answer = await question('请输入 GITHUB_REPO（格式 owner/repo，用于「访问链接即触发下载」，可留空稍后填）: ');
      if (answer && answer.trim()) {
        env.GITHUB_REPO = answer.trim();
        saveEnv(env);
        log(`✓ 已写入 GITHUB_REPO=${env.GITHUB_REPO}`, 'green');
      }
    }
  }
  
  // 6. 初始化远程数据库
  if (!skipDbInit) {
    initRemoteDatabase(db.name);
  } else {
    log('\n⚠️  跳过数据库初始化 (--skip-db-init)', 'yellow');
  }
  
  // 7. 安装依赖（默认跳过，需要显式指定 --install-deps）
  if (installDeps) {
    installDependencies();
  } else {
    log('\n⚠️  跳过依赖安装（默认行为，节省时间）', 'yellow');
    log('   如需安装依赖，请运行: pnpm install && cd backend && pnpm install && cd ../frontend && npm install', 'cyan');
    log('   或使用: pnpm init --install-deps', 'cyan');
  }
  
  // 8. 部署 Worker（必需，以获取 URL）
  const workerUrl = await deployWorker(env);
  if (workerUrl) {
    env.WORKER_URL = workerUrl;
    saveEnv(env);
    log(`✓ Worker URL 已保存到 .env: ${workerUrl}`, 'green');
  } else {
    log('⚠️  未能获取 Worker URL，请稍后运行 pnpm deploy 或手动从 Cloudflare Dashboard 获取', 'yellow');
  }
  
  // 9. 打印 GitHub Secrets 配置提示
  printGitHubSecretsInfo(env);
  
  log('\n╔════════════════════════════════════════╗', 'green');
  log('║     🎉 初始化完成！                    ║', 'green');
  log('╚════════════════════════════════════════╝', 'green');
  log('');
  log('📋 下一步:', 'blue');
  if (!installDeps) {
    log('   0. 安装依赖: pnpm install && cd backend && pnpm install && cd ../frontend && npm install', 'cyan');
  }
  log('   1. 运行 pnpm deploy 进行部署', 'cyan');
  log('   2. 运行 pnpm dev:local 进行本地开发测试', 'cyan');
  log('');
}

main().catch((error) => {
  log(`\n❌ 初始化失败: ${error.message}`, 'red');
  process.exit(1);
});
