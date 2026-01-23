import { useRef, useState, useEffect } from 'react';
import type { PlaylistItem } from '../db';
import { formatDuration } from '../utils/api';

interface Props {
  item: PlaylistItem;
  onClose: () => void;
}

export function AudioPlayer({ item, onClose }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleDurationChange = () => setDuration(audio.duration);
    const handleEnded = () => setPlaying(false);
    const handleLoadStart = () => setLoading(true);
    const handleCanPlay = () => setLoading(false);
    const handleError = () => {
      setLoading(false);
      setError('加载失败');
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('loadstart', handleLoadStart);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('loadstart', handleLoadStart);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('error', handleError);
      audio.pause();
    };
  }, []);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      try {
        await audio.play();
        setPlaying(true);
      } catch (err) {
        setError('播放失败：' + (err instanceof Error ? err.message : '未知错误'));
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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <div className="flex justify-between items-start mb-4">
          <h3 className="font-bold text-lg pr-4">{item.title}</h3>
          <button 
            onClick={onClose} 
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <audio ref={audioRef} src={item.audioUrl} />

        <div className="space-y-4">
          {/* 进度条 */}
          <div className="space-y-2">
            <input
              type="range"
              min="0"
              max={duration || 0}
              value={currentTime}
              onChange={handleSeek}
              className="w-full accent-blue-600"
              disabled={loading || !duration}
            />

            <div className="flex justify-between text-sm text-gray-600">
              <span>{formatDuration(Math.floor(currentTime))}</span>
              <span>{formatDuration(Math.floor(duration))}</span>
            </div>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="text-red-600 text-sm bg-red-50 p-2 rounded">
              {error}
            </div>
          )}

          {/* 播放按钮 */}
          <button 
            onClick={togglePlay} 
            className="w-full btn-primary text-lg"
            disabled={loading || !!error}
          >
            {loading ? '加载中...' : playing ? '⏸ 暂停' : '▶ 播放'}
          </button>

          <p className="text-xs text-gray-500 text-center">
            这是一个简单的测试播放器，用于验证音频下载是否成功。
          </p>
        </div>
      </div>
    </div>
  );
}
