#!/usr/bin/env python3
"""
检查上传状态和配置的诊断脚本
用于诊断为什么文件没有上传到R2
"""

import os
import sys
import requests
import json
from datetime import datetime

# 环境变量
WORKER_URL = os.environ.get('WORKER_URL', '').strip()
CLOUDFLARE_API_TOKEN = os.environ.get('CLOUDFLARE_API_TOKEN', '').strip()
CLOUDFLARE_ACCOUNT_ID = os.environ.get('CLOUDFLARE_ACCOUNT_ID', '').strip()
R2_BUCKET_NAME = os.environ.get('R2_BUCKET_NAME', 'b-cast').strip()

# 确保WORKER_URL格式正确
if WORKER_URL:
    if not WORKER_URL.startswith(('http://', 'https://')):
        WORKER_URL = f'https://{WORKER_URL}'
    WORKER_URL = WORKER_URL.rstrip('/')

def print_section(title):
    print("\n" + "=" * 60)
    print(f"  {title}")
    print("=" * 60)

def check_environment():
    """检查环境变量配置"""
    print_section("1. 环境变量检查")
    
    checks = {
        'WORKER_URL': WORKER_URL,
        'CLOUDFLARE_API_TOKEN': '已设置' if CLOUDFLARE_API_TOKEN else '❌ 未设置',
        'CLOUDFLARE_ACCOUNT_ID': CLOUDFLARE_ACCOUNT_ID,
        'R2_BUCKET_NAME': R2_BUCKET_NAME,
    }
    
    for key, value in checks.items():
        status = '✓' if value and value != '❌ 未设置' else '❌'
        print(f"  {status} {key}: {value}")
    
    if not WORKER_URL or not CLOUDFLARE_API_TOKEN or not CLOUDFLARE_ACCOUNT_ID:
        print("\n  ⚠️  缺少必需的环境变量！")
        return False
    return True

def check_worker_api():
    """检查Worker API是否可访问"""
    print_section("2. Worker API 连接检查")
    
    try:
        # 检查健康状态
        health_url = f'{WORKER_URL}/health'
        print(f"  📡 检查: {health_url}")
        response = requests.get(health_url, timeout=10)
        if response.status_code == 200:
            print(f"  ✓ Worker API 可访问")
            return True
        else:
            print(f"  ❌ Worker API 返回状态码: {response.status_code}")
            return False
    except Exception as e:
        print(f"  ❌ 无法连接到 Worker API: {e}")
        return False

def check_pending_downloads():
    """检查待下载任务"""
    print_section("3. 待下载任务检查")
    
    try:
        url = f'{WORKER_URL}/api/downloads/pending'
        print(f"  📡 请求: {url}")
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        data = response.json()
        
        if not data.get('success'):
            print(f"  ❌ API返回失败: {data.get('error')}")
            return []
        
        items = data.get('items', [])
        count = data.get('count', len(items))
        
        print(f"  ✓ 找到 {count} 个待下载任务")
        
        if items:
            print("\n  待下载任务列表:")
            for idx, item in enumerate(items[:10], 1):  # 只显示前10个
                print(f"    {idx}. {item.get('bvid')} - {item.get('title', '')[:50]}")
            if len(items) > 10:
                print(f"    ... 还有 {len(items) - 10} 个任务")
        else:
            print("  ⚠️  没有待下载的任务，所以不会触发上传")
            print("  💡 提示: 你需要在数据库中添加状态为 'pending' 的下载任务")
        
        return items
    except Exception as e:
        print(f"  ❌ 获取待下载列表失败: {e}")
        return []

def check_download_status():
    """检查最近的下载状态"""
    print_section("4. 最近的下载状态")
    
    try:
        # 尝试获取下载状态（如果有bvid的话）
        # 这里我们只检查API是否可用
        url = f'{WORKER_URL}/api/downloads/status?bvids='
        response = requests.get(url, timeout=10)
        if response.status_code == 200:
            print("  ✓ 下载状态API可用")
        else:
            print(f"  ⚠️  下载状态API返回: {response.status_code}")
    except Exception as e:
        print(f"  ⚠️  无法检查下载状态: {e}")

def check_r2_access():
    """检查R2访问权限（通过Wrangler）"""
    print_section("5. R2 访问权限检查")
    
    if not CLOUDFLARE_API_TOKEN or not CLOUDFLARE_ACCOUNT_ID:
        print("  ⚠️  缺少 Cloudflare 凭证，无法检查 R2 权限")
        return False
    
    try:
        import subprocess
        cmd = [
            'wrangler', 'r2', 'bucket', 'list'
        ]
        env = os.environ.copy()
        env['CLOUDFLARE_API_TOKEN'] = CLOUDFLARE_API_TOKEN
        env['CLOUDFLARE_ACCOUNT_ID'] = CLOUDFLARE_ACCOUNT_ID
        
        result = subprocess.run(cmd, capture_output=True, text=True, env=env, timeout=30)
        
        if result.returncode == 0:
            print("  ✓ Wrangler 可以访问 R2")
            if R2_BUCKET_NAME in result.stdout:
                print(f"  ✓ 找到目标 bucket: {R2_BUCKET_NAME}")
            else:
                print(f"  ⚠️  未在列表中找到 bucket: {R2_BUCKET_NAME}")
                print(f"  📋 可用 buckets:\n{result.stdout}")
            return True
        else:
            print(f"  ❌ Wrangler R2 访问失败:")
            print(f"     错误: {result.stderr}")
            return False
    except FileNotFoundError:
        print("  ❌ Wrangler 未安装或不在 PATH 中")
        print("  💡 安装: npm install -g wrangler")
        return False
    except Exception as e:
        print(f"  ❌ 检查 R2 权限时出错: {e}")
        return False

def check_r2_objects():
    """检查R2中的对象"""
    print_section("6. R2 中的音频文件")
    
    try:
        import subprocess
        cmd = [
            'wrangler', 'r2', 'object', 'list',
            f'{R2_BUCKET_NAME}',
            '--prefix', 'audio/',
            '--remote'
        ]
        env = os.environ.copy()
        env['CLOUDFLARE_API_TOKEN'] = CLOUDFLARE_API_TOKEN
        env['CLOUDFLARE_ACCOUNT_ID'] = CLOUDFLARE_ACCOUNT_ID
        
        result = subprocess.run(cmd, capture_output=True, text=True, env=env, timeout=30)
        
        if result.returncode == 0:
            lines = [line.strip() for line in result.stdout.strip().split('\n') if line.strip()]
            if lines:
                print(f"  ✓ 找到 {len(lines)} 个音频文件:")
                for line in lines[:10]:  # 只显示前10个
                    print(f"    - {line}")
                if len(lines) > 10:
                    print(f"    ... 还有 {len(lines) - 10} 个文件")
            else:
                print("  ⚠️  R2 bucket 中没有音频文件")
                print("  💡 这可能是正常的，如果还没有成功上传过文件")
            return True
        else:
            print(f"  ⚠️  无法列出 R2 对象: {result.stderr}")
            return False
    except Exception as e:
        print(f"  ⚠️  检查 R2 对象时出错: {e}")
        return False

def main():
    print("🔍 B-Cast 上传状态诊断工具")
    print(f"📅 {datetime.now().isoformat()}")
    print(f"🌐 Worker URL: {WORKER_URL}")
    
    # 1. 检查环境变量
    if not check_environment():
        print("\n❌ 环境变量配置不完整，请检查配置")
        sys.exit(1)
    
    # 2. 检查Worker API
    if not check_worker_api():
        print("\n⚠️  Worker API 不可访问，请检查 WORKER_URL 配置")
    
    # 3. 检查待下载任务
    pending_items = check_pending_downloads()
    
    # 4. 检查下载状态
    check_download_status()
    
    # 5. 检查R2访问权限
    check_r2_access()
    
    # 6. 检查R2中的对象
    check_r2_objects()
    
    # 总结
    print_section("诊断总结")
    
    if not pending_items:
        print("  ⚠️  主要问题: 没有待下载的任务")
        print("  💡 解决方案:")
        print("     1. 通过前端或API添加订阅")
        print("     2. 确保订阅的视频状态为 'pending'")
        print("     3. 手动触发 GitHub Actions workflow")
    else:
        print(f"  ✓ 有 {len(pending_items)} 个待下载任务")
        print("  💡 如果任务没有执行，请检查:")
        print("     1. GitHub Actions workflow 是否被触发")
        print("     2. GitHub Secrets 是否正确配置")
        print("     3. 查看 GitHub Actions 日志以获取详细错误信息")
    
    print("\n✅ 诊断完成")

if __name__ == '__main__':
    main()
