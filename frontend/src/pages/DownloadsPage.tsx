import { useState, useEffect } from 'react';
import { apiCall } from '../utils/api';

interface DownloadItem {
  id: string;
  bvid: string;
  title: string;
  status: string;
  audioUrl?: string;
  fileSize?: number;
  error?: string;
  addedAt: number;
  completedAt?: number;
}

export function DownloadsPage() {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDownloads();
  }, []);

  const loadDownloads = async () => {
    setLoading(true);
    try {
      const res = await apiCall('/api/downloads/list');
      setDownloads(res.items || []);
    } catch (err) {
      console.error('加载失败:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN');
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '-';
    const mb = bytes / 1024 / 1024;
    return `${mb.toFixed(2)} MB`;
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
      case 'downloaded': return '已完成';
      case 'downloading': return '下载中';
      case 'failed': return '失败';
      default: return '待下载';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">下载队列</h1>
            <p className="text-gray-600">查看所有下载记录和状态</p>
          </div>
          <button
            onClick={loadDownloads}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md"
          >
            刷新
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-500">加载中...</div>
        ) : (
          <div className="space-y-2">
            {downloads.map(item => (
              <div key={item.id} className="bg-white rounded-lg shadow p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{item.title}</div>
                    <div className="text-sm text-gray-500">{item.bvid}</div>
                  </div>

                  <div className="text-right space-y-1 ml-4">
                    <div className={`text-sm font-medium ${getStatusColor(item.status)}`}>
                      {getStatusText(item.status)}
                    </div>
                    
                    {item.fileSize && (
                      <div className="text-xs text-gray-500">
                        {formatSize(item.fileSize)}
                      </div>
                    )}
                    
                    <div className="text-xs text-gray-400">
                      {formatDate(item.addedAt)}
                    </div>
                  </div>
                </div>

                {item.error && (
                  <div className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded">
                    {item.error}
                  </div>
                )}

                {item.audioUrl && (
                  <div className="mt-2">
                    <a
                      href={item.audioUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline"
                    >
                      查看音频文件 →
                    </a>
                  </div>
                )}
              </div>
            ))}

            {downloads.length === 0 && (
              <div className="text-center py-12 bg-white rounded-lg shadow">
                <p className="text-gray-500">暂无下载记录</p>
              </div>
            )}
          </div>
        )}

        <div className="mt-8 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-bold mb-2">💡 如何触发下载？</h3>
          <ol className="text-sm space-y-1 list-decimal list-inside text-gray-700">
            <li>前往GitHub仓库的 Actions 标签页</li>
            <li>选择 "Download Audio (MVP)" workflow</li>
            <li>点击 "Run workflow" 按钮</li>
            <li>等待任务完成后，刷新此页面查看结果</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
