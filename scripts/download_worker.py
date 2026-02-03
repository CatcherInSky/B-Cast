#!/usr/bin/env python3
"""
B-Cast 下载脚本 - 改进版
通过Worker API获取任务和更新状态，使用yt-dlp下载B站音频并通过Wrangler上传到R2
"""

import os
import json
import sys
import subprocess
import requests
import time
from datetime import datetime
from pathlib import Path

try:
    from yt_dlp import YoutubeDL
except ImportError:
    print("❌ yt-dlp not installed")
    print("   Run: pip install yt-dlp")
    sys.exit(1)

# 环境变量
WORKER_URL = os.environ.get('WORKER_URL', '').strip()
CLOUDFLARE_API_TOKEN = os.environ.get('CLOUDFLARE_API_TOKEN', '').strip()
CLOUDFLARE_ACCOUNT_ID = os.environ.get('CLOUDFLARE_ACCOUNT_ID', '').strip()
R2_BUCKET_NAME = os.environ.get('R2_BUCKET_NAME', 'b-cast-audio').strip()
BILIBILI_SESSDATA = os.environ.get('BILIBILI_SESSDATA', '').strip()  # B站Cookie，用于下载受限视频

# 验证环境变量（检查是否为空字符串）
required_vars = {
    'WORKER_URL': WORKER_URL,
    'CLOUDFLARE_API_TOKEN': CLOUDFLARE_API_TOKEN,
    'CLOUDFLARE_ACCOUNT_ID': CLOUDFLARE_ACCOUNT_ID,
}

missing = [k for k, v in required_vars.items() if not v]
if missing:
    print(f"❌ Missing environment variables: {', '.join(missing)}")
    print(f"   WORKER_URL = '{WORKER_URL}'")
    print(f"   CLOUDFLARE_API_TOKEN = {'***' if CLOUDFLARE_API_TOKEN else '(empty)'}")
    print(f"   CLOUDFLARE_ACCOUNT_ID = {'***' if CLOUDFLARE_ACCOUNT_ID else '(empty)'}")
    sys.exit(1)

# 确保WORKER_URL格式正确：自动添加 https:// 前缀（如果缺失）
if WORKER_URL:
    if not WORKER_URL.startswith(('http://', 'https://')):
        WORKER_URL = f'https://{WORKER_URL}'
    WORKER_URL = WORKER_URL.rstrip('/')
else:
    print("❌ WORKER_URL is empty after processing")
    sys.exit(1)

def get_pending_downloads(limit=None):
    """从Worker API获取待下载任务。limit 为单次最多条数，用于控制每轮下载量（防超时/限流）。"""
    try:
        url = f'{WORKER_URL}/api/downloads/pending'
        if limit is not None and limit > 0:
            url = f'{url}?limit={min(limit, 50)}'
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        data = response.json()
        
        if not data.get('success'):
            raise Exception(f"API返回失败: {data.get('error')}")
        
        return data.get('items', [])
    except Exception as e:
        raise Exception(f"获取待下载列表失败: {str(e)}")

def update_download_status(bvid, status, audio_url=None, file_size=None, error=None):
    """更新下载状态到Worker API"""
    try:
        payload = {
            'bvid': bvid,
            'status': status
        }
        
        if audio_url:
            payload['audioUrl'] = audio_url
        if file_size:
            payload['fileSize'] = file_size
        if error:
            payload['error'] = error
        
        response = requests.post(
            f'{WORKER_URL}/api/downloads/update-status',
            json=payload,
            timeout=30
        )
        response.raise_for_status()
        data = response.json()
        
        if not data.get('success'):
            raise Exception(f"API返回失败: {data.get('error')}")
        
        return True
    except Exception as e:
        print(f"   ⚠️  更新状态失败: {e}")
        return False

def download_audio(bvid, title):
    """使用 yt-dlp 命令行直接下载音频，优先 m4a（不转码，缩短 Action 执行时间）。"""
    url = f'https://www.bilibili.com/video/{bvid}'
    temp_dir = Path('/tmp/b-cast-downloads')
    temp_dir.mkdir(exist_ok=True)
    output_path = temp_dir / bvid

    # 直接使用命令行执行 yt-dlp，完全按照本地成功的命令（不添加任何多余参数）
    # 使用 %(id)s 与本地命令完全一致，通过工作目录指定输出位置
    cmd = [
        'yt-dlp',
        '-f', 'bestaudio[ext=m4a]/bestaudio',
        '-o', '%(id)s.%(ext)s',  # 完全按照本地成功的命令格式
        url
    ]
    
    # 如果有 Cookie，添加到命令中
    if BILIBILI_SESSDATA:
        if BILIBILI_SESSDATA.startswith('SESSDATA=') or '=' in BILIBILI_SESSDATA:
            cookie_header = BILIBILI_SESSDATA
        else:
            cookie_header = f'SESSDATA={BILIBILI_SESSDATA}'
        cmd.insert(-1, '--add-header')
        cmd.insert(-1, f'Cookie:{cookie_header}')
        print(f"   🔐 使用 Cookie 进行下载")
    
    # 打印实际执行的命令（用于调试）
    cmd_str = ' '.join(f'"{arg}"' if ' ' in arg or '://' in arg else arg for arg in cmd)
    print(f"   💻 执行命令: {cmd_str}")

    try:
        # 执行命令，在临时目录中运行（这样 %(id)s 会生成在临时目录）
        result = subprocess.run(
            cmd,
            cwd=str(temp_dir),  # 在临时目录中执行，%(id)s 会生成在这里
            capture_output=True,
            text=True,
            timeout=600  # 10分钟超时
        )
        
        if result.returncode != 0:
            error_msg = result.stderr or result.stdout
            print(f"   ❌ yt-dlp 错误输出: {error_msg[:500]}")
            raise Exception(f"yt-dlp下载失败: {error_msg[:200]}")
        
        # 查找下载的文件（yt-dlp 会根据格式选择下载的文件）
        # 使用 %(id)s 时，文件名就是 bvid + 扩展名
        possible_exts = ['m4a', 'mp4', 'webm', 'opus', 'ogg', 'mp3', 'aac']
        final_path = None
        ext = None
        
        for possible_ext in possible_exts:
            test_path = temp_dir / f'{bvid}.{possible_ext}'
            if test_path.exists():
                final_path = str(test_path)
                ext = possible_ext
                break
        
        if not final_path:
            raise Exception(f"下载的文件未找到，bvid: {bvid}, 临时目录: {temp_dir}")
        
        file_size = os.path.getsize(final_path)
        print(f"   ✅ 下载成功: {file_size / 1024 / 1024:.2f}MB (.{ext})")
        return final_path, file_size, ext
        
    except subprocess.TimeoutExpired:
        raise Exception("yt-dlp下载超时（10分钟）")
    except Exception as e:
        raise Exception(f"yt-dlp下载失败: {str(e)}")

# 扩展名 -> Content-Type（R2 上传与 Worker 响应用）
AUDIO_CONTENT_TYPES = {
    'm4a': 'audio/mp4',
    'mp4': 'audio/mp4',
    'webm': 'audio/webm',
    'opus': 'audio/opus',
    'ogg': 'audio/ogg',
    'mp3': 'audio/mpeg',
    'aac': 'audio/aac',
}


def upload_to_r2_via_wrangler(local_path, bvid, ext='m4a', remote=True):
    """通过 Wrangler CLI 上传文件到 R2，支持多种音频扩展名。
    
    Args:
        local_path: 本地文件路径
        bvid: 视频BV号
        ext: 文件扩展名（默认 m4a）
        remote: 是否上传到远程R2（默认True，GitHub Actions中必须为True）
    """
    try:
        audio_key = f'audio/{bvid}.{ext}'
        content_type = AUDIO_CONTENT_TYPES.get(ext, 'application/octet-stream')
        cmd = [
            'wrangler', 'r2', 'object', 'put',
            f'{R2_BUCKET_NAME}/{audio_key}',
            '--file', local_path,
            '--content-type', content_type,
        ]
        # 在GitHub Actions或远程环境中，必须添加 --remote 标志
        if remote:
            cmd.append('--remote')
        
        env = os.environ.copy()
        env['CLOUDFLARE_API_TOKEN'] = CLOUDFLARE_API_TOKEN
        env['CLOUDFLARE_ACCOUNT_ID'] = CLOUDFLARE_ACCOUNT_ID
        
        print(f"   🔧 执行命令: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True, env=env, timeout=300)
        
        if result.returncode != 0:
            error_msg = result.stderr or result.stdout
            print(f"   ❌ Wrangler输出: {error_msg}")
            raise Exception(f"Wrangler上传失败: {error_msg}")
        
        # 打印成功信息
        if result.stdout:
            print(f"   📝 Wrangler输出: {result.stdout.strip()}")
        
        # 带扩展名的 URL，Worker 据此从 R2 取对应文件
        audio_url = f"{WORKER_URL}/api/downloads/audio/{bvid}.{ext}"
        return audio_url
    except subprocess.TimeoutExpired:
        raise Exception("上传超时（5分钟）")
    except Exception as e:
        raise Exception(f"R2上传失败: {str(e)}")

def main():
    print("🚀 B-Cast Download Worker")
    print(f"📅 {datetime.now().isoformat()}")
    print(f"🌐 Worker URL: {WORKER_URL}")
    # 调试信息：显示 URL 是否包含协议
    if WORKER_URL.startswith(('http://', 'https://')):
        print(f"   ✓ URL 格式正确（包含协议）")
    else:
        print(f"   ⚠️  URL 格式可能有问题（缺少协议）")
    print()
    
    # 初始化 summary，确保即使失败也能生成文件
    summary = {
        'timestamp': datetime.now().isoformat(),
        'total': 0,
        'success': 0,
        'failed': 0,
        'items': [],
        'error': None
    }
    
    # 1. 获取待下载任务（可选：环境变量 DOWNLOAD_LIMIT 限制单次条数，避免超时或 B 站限流）
    limit_str = os.environ.get('DOWNLOAD_LIMIT')
    limit = int(limit_str) if (limit_str and limit_str.isdigit()) else None
    if limit is not None:
        print(f"📥 获取待下载任务（本次最多 {limit} 条）...")
    else:
        print("📥 获取待下载任务...")
    try:
        pending_items = get_pending_downloads(limit=limit)
    except Exception as e:
        error_msg = str(e)
        print(f"❌ {error_msg}")
        summary['error'] = error_msg
        # 即使失败也要写入 summary
        with open('download-summary.json', 'w') as f:
            json.dump(summary, f, indent=2)
        sys.exit(1)
    
    if not pending_items:
        print("✅ 没有待下载的任务")
        # 写入summary
        summary['total'] = 0
        with open('download-summary.json', 'w') as f:
            json.dump(summary, f, indent=2)
        return
    
    # 更新 summary 的 total
    summary['total'] = len(pending_items)
    
    print(f"📋 找到 {len(pending_items)} 个待下载任务")
    print()
    
    success_count = 0
    fail_count = 0
    
    for idx, item in enumerate(pending_items):
        bvid = item['bvid']
        title = item['title']
        
        # 在任务之间添加延迟，避免请求过快触发 B站限流（第一个任务不需要延迟）
        if idx > 0:
            delay = 2  # 延迟 2 秒
            print(f"   ⏸️  等待 {delay} 秒，避免请求过快...")
            time.sleep(delay)
        
        print(f"⏳ 处理: {bvid} - {title[:50]}...")
        item_result = {
            'bvid': bvid,
            'title': title,
            'status': 'failed',
            'error': None
        }
        
        try:
            # 2. 更新状态为downloading
            update_download_status(bvid, 'downloading')
            
            # 3. 下载音频（直接下 m4a 或最佳音频，不转码）
            print(f"   📥 下载中...")
            audio_path, file_size, ext = download_audio(bvid, title)
            print(f"   ✅ 已下载: {file_size / 1024 / 1024:.2f}MB (.{ext})")
            
            # 4. 上传到R2
            print(f"   📤 上传到R2...")
            audio_url = upload_to_r2_via_wrangler(audio_path, bvid, ext)
            print(f"   ✅ 已上传: {audio_url}")
            
            # 5. 更新状态为completed
            update_download_status(bvid, 'completed', audio_url, file_size)
            
            # 清理临时文件
            try:
                os.remove(audio_path)
            except:
                pass
            
            print(f"✅ 完成: {bvid}")
            success_count += 1
            item_result['status'] = 'success'
            item_result['audio_url'] = audio_url
            item_result['file_size'] = file_size
            
        except Exception as e:
            error_msg = str(e)
            print(f"❌ 失败: {bvid} - {error_msg}")
            fail_count += 1
            
            # 更新失败状态
            update_download_status(bvid, 'failed', error=error_msg[:500])
            
            item_result['error'] = error_msg
        
        summary['items'].append(item_result)
        print()
    
    # 更新 summary 的统计信息
    summary['success'] = success_count
    summary['failed'] = fail_count
    
    # 写入summary（使用 try-except 确保即使写入失败也不影响主流程）
    try:
        with open('download-summary.json', 'w') as f:
            json.dump(summary, f, indent=2)
    except Exception as e:
        print(f"⚠️  写入 summary 文件失败: {e}")
    
    # 打印总结
    print("=" * 60)
    print(f"✅ 成功: {success_count}")
    print(f"❌ 失败: {fail_count}")
    print(f"📊 总计: {len(pending_items)}")
    print("=" * 60)
    
    # 如果有失败，返回非0退出码
    if fail_count > 0:
        sys.exit(1)

if __name__ == '__main__':
    main()
