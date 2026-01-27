// 下载状态同步工具
import { apiCall } from './api';
import { db, PlaylistItem } from '../db';

interface DownloadStatusItem {
  bvid: string;
  status: string;
  audioUrl?: string;
  fileSize?: number;
  error?: string;
}

/**
 * 从后端同步下载状态到 IndexedDB
 * 更新 PlaylistItem 的 downloadStatus 和 audioUrl
 */
export async function syncDownloadStatus(bvid: string): Promise<void> {
  try {
    // 从后端获取该视频的下载状态
    const res = await apiCall(`/api/downloads/status?bvids=${bvid}`);
    const items: DownloadStatusItem[] = res.items || [];
    
    if (items.length === 0) {
      return; // 没有找到该视频的下载记录
    }
    
    const downloadItem = items[0];
    
    // 更新 IndexedDB 中对应的 PlaylistItem
    const playlistItems = await db.playlistItems
      .where('bvid')
      .equals(bvid)
      .toArray();
    
    for (const item of playlistItems) {
      const updates: Partial<PlaylistItem> = {};
      
      // 映射后端状态到前端状态
      if (downloadItem.status === 'completed') {
        updates.downloadStatus = 'downloaded';
        if (downloadItem.audioUrl) {
          updates.audioUrl = downloadItem.audioUrl;
        }
        if (downloadItem.fileSize) {
          updates.fileSize = downloadItem.fileSize;
        }
      } else if (downloadItem.status === 'downloading') {
        updates.downloadStatus = 'downloading';
      } else if (downloadItem.status === 'failed') {
        updates.downloadStatus = 'failed';
      } else {
        updates.downloadStatus = 'pending';
      }
      
      await db.playlistItems.update(item.id, updates);
    }
  } catch (error) {
    console.error(`同步下载状态失败 (${bvid}):`, error);
  }
}

/**
 * 批量同步多个视频的下载状态
 */
export async function syncMultipleDownloadStatus(bvids: string[]): Promise<void> {
  if (bvids.length === 0) return;
  
  try {
    const bvidsStr = bvids.join(',');
    const res = await apiCall(`/api/downloads/status?bvids=${bvidsStr}`);
    const downloadItems: DownloadStatusItem[] = res.items || [];
    
    // 创建映射表
    const statusMap = new Map<string, { status: string; audioUrl?: string; fileSize?: number }>(
      downloadItems.map((item) => [
        item.bvid,
        {
          status: item.status,
          audioUrl: item.audioUrl,
          fileSize: item.fileSize,
        }
      ])
    );
    
    // 更新所有相关的 PlaylistItem
    const playlistItems = await db.playlistItems
      .where('bvid')
      .anyOf(bvids)
      .toArray();
    
    for (const item of playlistItems) {
      const downloadInfo = statusMap.get(item.bvid);
      if (!downloadInfo) continue;
      
      const updates: Partial<PlaylistItem> = {};
      
      if (downloadInfo.status === 'completed') {
        updates.downloadStatus = 'downloaded';
        if (downloadInfo.audioUrl) {
          updates.audioUrl = downloadInfo.audioUrl;
        }
        if (downloadInfo.fileSize) {
          updates.fileSize = downloadInfo.fileSize;
        }
      } else if (downloadInfo.status === 'downloading') {
        updates.downloadStatus = 'downloading';
      } else if (downloadInfo.status === 'failed') {
        updates.downloadStatus = 'failed';
      } else {
        updates.downloadStatus = 'pending';
      }
      
      await db.playlistItems.update(item.id, updates);
    }
  } catch (error) {
    console.error('批量同步下载状态失败:', error);
  }
}

/**
 * 获取音频文件的完整 URL
 * 如果 IndexedDB 中没有，尝试从后端获取
 */
export async function getAudioUrl(bvid: string): Promise<string | null> {
  // 先从 IndexedDB 查找
  const playlistItem = await db.playlistItems
    .where('bvid')
    .equals(bvid)
    .first();
  
  if (playlistItem?.audioUrl) {
    return playlistItem.audioUrl;
  }
  
  // 如果 IndexedDB 中没有，尝试从后端同步
  try {
    await syncDownloadStatus(bvid);
    
    // 再次查找
    const updatedItem = await db.playlistItems
      .where('bvid')
      .equals(bvid)
      .first();
    
    return updatedItem?.audioUrl || null;
  } catch (error) {
    console.error(`获取音频URL失败 (${bvid}):`, error);
    return null;
  }
}

/**
 * 构建音频文件的 Worker API URL
 * 这是获取 R2 上音频文件的标准方式
 */
export function buildAudioUrl(bvid: string, baseUrl?: string): string {
  const apiBase = baseUrl || import.meta.env.VITE_API_BASE || '';
  return `${apiBase}/api/downloads/audio/${bvid}`;
}
