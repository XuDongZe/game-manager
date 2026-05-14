import { useEffect, useState, useRef } from 'react';
import { LogMessage } from '../types';

interface LogViewerProps {
  url: string;
  method?: 'GET' | 'POST';
  body?: BodyInit;
  onComplete?: () => void;
  onError?: (err: string) => void;
}

export default function LogViewer({ url, method = 'GET', body, onComplete, onError }: LogViewerProps) {
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const isStarted = useRef(false);

  useEffect(() => {
    if (isStarted.current) return;
    isStarted.current = true;

    let isMounted = true;

    const startStream = async () => {
      try {
        const response = await fetch(url, {
          method,
          body,
          headers: method === 'POST' && !(body instanceof FormData) 
            ? { 'Content-Type': 'application/json' } 
            : undefined
        });

        if (!response.ok) {
          throw new Error(`请求失败: ${response.status}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        if (!reader) throw new Error('无法读取响应流');

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim().startsWith('data: ')) {
              const dataStr = line.replace('data: ', '').trim();
              if (!dataStr) continue;
              
              try {
                const data = JSON.parse(dataStr) as LogMessage;
                if (isMounted) {
                  setLogs(prev => [...prev, data]);
                }
                if (data.done) {
                  if (isMounted && onComplete) onComplete();
                  return;
                }
              } catch (e) {
                console.error('Failed to parse SSE data', e, dataStr);
              }
            }
          }
        }
      } catch (err) {
        const error = err as Error;
        if (isMounted && onError) {
          onError(error.message || '部署失败');
        }
      }
    };

    startStream();

    return () => {
      isMounted = false;
    };
  }, [url, method, body, onComplete, onError]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div style={{
      backgroundColor: '#1e1e1e',
      color: '#d4d4d4',
      padding: '16px',
      borderRadius: '8px',
      fontFamily: 'monospace',
      height: '400px',
      overflowY: 'auto',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-all'
    }} ref={containerRef}>
      {logs.length === 0 && <div>等待日志...</div>}
      {logs.map((log, index) => (
        <div key={index} style={{ marginBottom: '4px' }}>
          {log.time && <span style={{ color: '#569cd6', marginRight: '8px' }}>[{new Date(log.time).toLocaleTimeString()}]</span>}
          <span>{log.message}</span>
        </div>
      ))}
    </div>
  );
}