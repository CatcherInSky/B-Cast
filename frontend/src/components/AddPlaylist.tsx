import { useState } from 'react';
import { apiCall, generateId } from '../utils/api';
import { db } from '../db';

export function AddPlaylist({ onSuccess }: { onSuccess?: () => void }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAdd = async () => {
    if (!url.trim()) {
      setError('请输入URL');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // 1. 解析URL
      const parseRes = await apiCall<{
        success: boolean;
        data?: {
          playlist: {
            name: string;
            type: 'collection' | 'uploader' | 'single';
            uploaderName: string;
            cover?: string;
            description?: string;
          };
          items: Array<{
            bvid: string;
            title: string;
            duration: number;
            cover: string;
            pubDate: number;
          }>;
        };
        error?: string;
      }>('/api/bilibili/parse', {
        method: 'POST',
        body: JSON.stringify({ url }),
      });

      if (!parseRes.success || !parseRes.data) {
        throw new Error(parseRes.error || '解析失败');
      }

      const { playlist, items } = parseRes.data;

      // 2. 保存到IndexedDB
      const playlistId = generateId();
      await db.playlists.add({
        id: playlistId,
        name: playlist.name,
        type: playlist.type,
        bilibiliUrl: url,
        uploaderName: playlist.uploaderName,
        cover: playlist.cover,
        description: playlist.description,
        createdAt: Date.now(),
      });

      const playlistItems = items.map(item => ({
        id: generateId(),
        playlistId,
        bvid: item.bvid,
        title: item.title,
        duration: item.duration,
        cover: item.cover,
        pubDate: item.pubDate,
        downloadStatus: 'pending' as const,
        addedAt: Date.now(),
      }));

      await db.playlistItems.bulkAdd(playlistItems);

      // 3. 添加到下载队列
      await apiCall('/api/downloads/queue', {
        method: 'POST',
        body: JSON.stringify({
          items: items.map(item => ({
            bvid: item.bvid,
            title: item.title,
            duration: item.duration,
          })),
        }),
      });

      setUrl('');
      alert(`添加成功！共${items.length}个项目\n请在GitHub Actions中手动触发下载。`);
      
      if (onSuccess) {
        onSuccess();
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : '添加失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <h2 className="text-xl font-bold mb-4">添加播放列表</h2>
      
      <input
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="输入B站URL（合集/UP主空间/单个视频）"
        className="input mb-2"
        disabled={loading}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !loading) {
            handleAdd();
          }
        }}
      />

      {error && <div className="error">{error}</div>}

      <button 
        onClick={handleAdd} 
        disabled={loading || !url.trim()}
        className="btn-primary w-full mt-4"
      >
        {loading ? '解析中...' : '添加'}
      </button>

      <div className="help-text mt-4">
        <p className="font-medium mb-2">支持的URL类型：</p>
        <ul className="list-disc list-inside space-y-1 text-xs">
          <li>UP主空间: https://space.bilibili.com/123456</li>
          <li>合集: https://space.bilibili.com/123456/channel/collectiondetail?sid=789</li>
          <li>单个视频: https://www.bilibili.com/video/BV1xx4y1x7xx</li>
        </ul>
      </div>
    </div>
  );
}
