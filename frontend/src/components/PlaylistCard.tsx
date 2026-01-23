import { useState, useEffect } from 'react';
import { db, type Playlist, type PlaylistItem } from '../db';
import { AudioPlayer } from './AudioPlayer';
import { formatDuration } from '../utils/api';

interface Props {
  playlist: Playlist;
  onDelete: () => void;
}

export function PlaylistCard({ playlist, onDelete }: Props) {
  const [items, setItems] = useState<PlaylistItem[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [selectedItem, setSelectedItem] = useState<PlaylistItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadItems();
  }, [playlist.id]);

  const loadItems = async () => {
    try {
      setLoading(true);
      const items = await db.playlistItems
        .where('playlistId')
        .equals(playlist.id)
        .reverse()
        .sortBy('pubDate');
      setItems(items);
    } catch (err) {
      console.error('加载播放项失败:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`确定删除播放列表"${playlist.name}"？\n这将删除${items.length}个项目。`)) {
      return;
    }
    
    try {
      await db.playlistItems.where('playlistId').equals(playlist.id).delete();
      await db.playlists.delete(playlist.id);
      onDelete();
    } catch (err) {
      console.error('删除失败:', err);
      alert('删除失败，请重试');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'downloaded': return 'text-green-600';
      case 'downloading': return 'text-blue-600';
      case 'failed': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return '待下载';
      case 'downloading': return '下载中';
      case 'downloaded': return '已下载';
      case 'failed': return '失败';
      default: return status;
    }
  };

  return (
    <div className="card">
      {/* 播放列表信息 */}
      <div className="flex items-start gap-4">
        {playlist.cover && (
          <img
            src={playlist.cover}
            alt={playlist.name}
            className="w-24 h-24 rounded object-cover flex-shrink-0"
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        )}
        
        <div className="flex-1 min-w-0">
          <h3 className="text-xl font-bold truncate">{playlist.name}</h3>
          <p className="text-gray-600 text-sm">{playlist.uploaderName}</p>
          <p className="text-sm text-gray-500 mt-1">
            {items.length} 个项目 · {playlist.type === 'collection' ? '合集' : playlist.type === 'uploader' ? 'UP主' : '单个视频'}
          </p>
          {playlist.description && (
            <p className="text-sm text-gray-600 mt-2 line-clamp-2">{playlist.description}</p>
          )}
        </div>

        <div className="flex gap-2 flex-shrink-0">
          <button 
            onClick={() => setExpanded(!expanded)} 
            className="btn-secondary text-sm"
          >
            {expanded ? '收起' : '展开'}
          </button>
          <button onClick={handleDelete} className="btn-danger text-sm">
            删除
          </button>
        </div>
      </div>

      {/* 播放项列表 */}
      {expanded && (
        <div className="mt-4 space-y-2 border-t pt-4">
          {loading ? (
            <div className="text-center py-4 text-gray-500">加载中...</div>
          ) : items.length === 0 ? (
            <div className="text-center py-4 text-gray-500">暂无项目</div>
          ) : (
            items.map(item => (
              <div
                key={item.id}
                className="flex items-center gap-3 p-3 border rounded hover:bg-gray-50 transition-colors"
              >
                <img
                  src={item.cover}
                  alt={item.title}
                  className="w-16 h-16 rounded object-cover flex-shrink-0"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="64" height="64"%3E%3Crect fill="%23ddd" width="64" height="64"/%3E%3C/svg%3E';
                  }}
                />
                
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{item.title}</div>
                  <div className="text-sm text-gray-500">
                    {formatDuration(item.duration)} · {item.bvid}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className={`text-sm font-medium ${getStatusColor(item.downloadStatus)}`}>
                    {getStatusText(item.downloadStatus)}
                  </div>

                  {item.downloadStatus === 'downloaded' && item.audioUrl && (
                    <button
                      onClick={() => setSelectedItem(item)}
                      className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                    >
                      测试播放
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 简单的音频播放器 */}
      {selectedItem && (
        <AudioPlayer
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  );
}
