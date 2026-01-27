import { useRef, useState, useEffect } from 'react';
import { PlaylistItem } from '../db';

interface AudioPlayerProps {
  item: PlaylistItem;
  onClose: () => void;
}

export function AudioPlayer({ item, onClose }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(1);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !item.audioUrl) {
      setError('音频URL未设置');
      setLoading(false);
      return;
    }

    // 重置状态
    setError(null);
    setLoading(true);
    setCurrentTime(0);
    setDuration(0);

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleDurationChange = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
        setLoading(false);
      }
    };
    const handleEnded = () => {
      setPlaying(false);
      setCurrentTime(0);
    };
    const handlePlay = () => {
      setPlaying(true);
      setLoading(false);
    };
    const handlePause = () => setPlaying(false);
    const handleLoadStart = () => {
      setLoading(true);
      setError(null);
    };
    const handleCanPlay = () => {
      setLoading(false);
      setError(null);
    };
    const handleLoadedMetadata = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
      setLoading(false);
    };
    const handleError = (e: Event) => {
      const audioElement = e.target as HTMLAudioElement;
      let errorMsg = '音频加载失败';
      
      if (audioElement.error) {
        switch (audioElement.error.code) {
          case MediaError.MEDIA_ERR_ABORTED:
            errorMsg = '音频加载被中止';
            break;
          case MediaError.MEDIA_ERR_NETWORK:
            errorMsg = '网络错误，请检查网络连接';
            break;
          case MediaError.MEDIA_ERR_DECODE:
            errorMsg = '音频解码失败';
            break;
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            errorMsg = '不支持的音频格式';
            break;
          default:
            errorMsg = '音频加载失败，请检查URL是否正确';
        }
      }
      
      setError(errorMsg);
      setLoading(false);
      console.error('Audio error:', audioElement.error, item.audioUrl);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('loadstart', handleLoadStart);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('error', handleError);

    // 设置音量
    audio.volume = volume;

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('loadstart', handleLoadStart);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('error', handleError);
    };
  }, [volume, item.audioUrl]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      audio.pause();
    } else {
      try {
        await audio.play();
      } catch (err: any) {
        setError('播放失败：' + (err.message || '未知错误'));
        console.error('Play error:', err);
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    
    const newTime = Number(e.target.value);
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    const newVolume = Number(e.target.value);
    setVolume(newVolume);
    if (audio) {
      audio.volume = newVolume;
    }
  };

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1 min-w-0 pr-4">
            <h3 className="font-bold text-lg truncate">{item.title}</h3>
            <p className="text-sm text-gray-500 mt-1">{item.bvid}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none flex-shrink-0"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        <audio ref={audioRef} src={item.audioUrl} preload="metadata" />

        {error ? (
          <div className="text-red-600 bg-red-50 p-3 rounded mb-4">
            {error}
          </div>
        ) : null}

        <div className="space-y-4">
          {/* 进度条 */}
          <div className="relative">
            <input
              type="range"
              min="0"
              max={duration || 0}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${progressPercent}%, #e5e7eb ${progressPercent}%, #e5e7eb 100%)`
              }}
            />
          </div>

          {/* 时间显示 */}
          <div className="flex justify-between text-sm text-gray-600">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>

          {/* 控制按钮 */}
          <div className="flex items-center gap-4">
            <button
              onClick={togglePlay}
              disabled={loading}
              className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-md transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="animate-spin">⏳</span>
                  <span>加载中...</span>
                </>
              ) : playing ? (
                <>
                  <span>⏸</span>
                  <span>暂停</span>
                </>
              ) : (
                <>
                  <span>▶</span>
                  <span>播放</span>
                </>
              )}
            </button>
          </div>

          {/* 音量控制 */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 w-12">音量:</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume}
              onChange={handleVolumeChange}
              className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-sm text-gray-600 w-12 text-right">
              {Math.round(volume * 100)}%
            </span>
          </div>
        </div>

        {item.audioUrl && (
          <div className="mt-4 pt-4 border-t">
            <a
              href={item.audioUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline"
            >
              🔗 在新标签页中打开音频文件
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
