import { useState, useEffect } from 'react';
import { db, Playlist, PlaylistItem } from '../db';
import { AudioPlayer } from './AudioPlayer';

interface PlaylistCardProps {
  playlist: Playlist;
  onDelete: () => void;
}

export function PlaylistCard({ playlist, onDelete }: PlaylistCardProps) {
  const [items, setItems] = useState<PlaylistItem[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [selectedItem, setSelectedItem] = useState<PlaylistItem | null>(null);
  const [showCopied, setShowCopied] = useState(false);

  useEffect(() => {
    loadItems();
  }, [playlist.id]);

  const loadItems = async () => {
    const items = await db.playlistItems
      .where('playlistId')
      .equals(playlist.id)
      .sortBy('pubDate');
    setItems(items);
  };

  const handleDelete = async () => {
    if (!confirm('确定删除此播放列表？')) return;
    
    await db.playlistItems.where('playlistId').equals(playlist.id).delete();
    await db.playlists.delete(playlist.id);
    onDelete();
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
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
      case 'downloaded': return '已下载';
      case 'downloading': return '下载中';
      case 'failed': return '失败';
      default: return '待下载';
    }
  };

  const handleCopyRSS = async () => {
    if (!playlist.rssUrl) return;
    
    try {
      await navigator.clipboard.writeText(playlist.rssUrl);
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2000);
    } catch (error) {
      alert('复制失败，请手动复制：\n' + playlist.rssUrl);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-4">
      {/* 播放列表信息 */}
      <div className="flex items-start gap-4">
        {playlist.cover && (
          <img
            src={playlist.cover}
            alt={playlist.name}
            className="w-24 h-24 rounded object-cover flex-shrink-0"
            referrerPolicy="no-referrer"
          />
        )}
        
        <div className="flex-1 min-w-0">
          <h3 className="text-xl font-bold truncate">{playlist.name}</h3>
          <p className="text-gray-600">{playlist.uploaderName}</p>
          <p className="text-sm text-gray-500">{items.length} 个项目</p>
          {playlist.description && (
            <p className="text-sm text-gray-600 mt-2 line-clamp-2">{playlist.description}</p>
          )}
          
          {/* RSS地址 */}
          {playlist.rssUrl && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-sm text-gray-500">RSS:</span>
              <code className="text-xs bg-gray-100 px-2 py-1 rounded flex-1 truncate">
                {playlist.rssUrl}
              </code>
              <button
                onClick={handleCopyRSS}
                className="text-sm px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded whitespace-nowrap"
              >
                {showCopied ? '✓ 已复制' : '复制'}
              </button>
            </div>
          )}
        </div>

        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={() => setExpanded(!expanded)}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md"
          >
            {expanded ? '收起' : '展开'}
          </button>
          <button
            onClick={handleDelete}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md"
          >
            删除
          </button>
        </div>
      </div>

      {/* 播放项列表 */}
      {expanded && (
        <div className="mt-4 space-y-2">
          {items.map(item => (
            <div
              key={item.id}
              className="flex items-center gap-3 p-3 border rounded hover:bg-gray-50"
            >
              <img
                src={item.cover}
                alt={item.title}
                className="w-16 h-16 rounded object-cover flex-shrink-0"
                referrerPolicy="no-referrer"
              />
              
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{item.title}</div>
                <div className="text-sm text-gray-500">
                  {formatDuration(item.duration)} · {item.bvid}
                </div>
              </div>

              <div className={`text-sm ${getStatusColor(item.downloadStatus)} whitespace-nowrap`}>
                {getStatusText(item.downloadStatus)}
              </div>

              {item.downloadStatus === 'downloaded' && item.audioUrl && (
                <button
                  onClick={() => setSelectedItem(item)}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded whitespace-nowrap"
                >
                  测试播放
                </button>
              )}
            </div>
          ))}
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
