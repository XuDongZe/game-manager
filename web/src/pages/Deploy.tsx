import { useState, useRef, DragEvent } from 'react';
import { Link } from 'react-router-dom';
import LogViewer from '../components/LogViewer';

export default function Deploy() {
  const [userId, setUserId] = useState('');
  const [gameName, setGameName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployComplete, setDeployComplete] = useState(false);
  const [deployError, setDeployError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.name.endsWith('.zip')) {
        setFile(droppedFile);
      } else {
        alert('只能上传 ZIP 文件');
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const startDeploy = () => {
    if (!userId || !gameName || !file) {
      alert('请填写完整信息并上传文件');
      return;
    }
    
    setIsDeploying(true);
    setDeployComplete(false);
    setDeployError('');
  };

  const formData = new FormData();
  if (isDeploying) {
    formData.append('userId', userId);
    formData.append('gameName', gameName);
    if (file) formData.append('file', file);
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '24px', marginBottom: '24px' }}>部署新游戏</h1>

      {!isDeploying ? (
        <div style={{ background: '#fff', padding: '24px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>开发者 ID (userId)</label>
            <input 
              type="text" 
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="例如: admin"
              style={{ width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '4px' }}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>游戏标识 (gameName)</label>
            <input 
              type="text" 
              value={gameName}
              onChange={(e) => setGameName(e.target.value)}
              placeholder="例如: tetris (只允许英文和数字)"
              style={{ width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '4px' }}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>游戏产物 (.zip 压缩包)</label>
            <div 
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${isDragging ? 'var(--primary-color)' : 'var(--border-color)'}`,
                borderRadius: '8px',
                padding: '48px 24px',
                textAlign: 'center',
                backgroundColor: isDragging ? '#eff6ff' : '#f9fafb',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <input 
                type="file" 
                accept=".zip" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                style={{ display: 'none' }} 
              />
              {file ? (
                <div>
                  <div style={{ fontSize: '48px', marginBottom: '8px' }}>📦</div>
                  <div style={{ fontWeight: 'bold', color: 'var(--primary-color)' }}>{file.name}</div>
                  <div style={{ color: '#6b7280', fontSize: '14px', marginTop: '4px' }}>{(file.size / 1024).toFixed(2)} KB</div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: '48px', marginBottom: '8px', color: '#9ca3af' }}>☁️</div>
                  <div style={{ fontWeight: 'bold', color: '#4b5563' }}>点击或拖拽 ZIP 文件到此处</div>
                  <div style={{ color: '#9ca3af', fontSize: '14px', marginTop: '4px' }}>必须包含 index.html 等静态资源</div>
                </div>
              )}
            </div>
          </div>

          <button 
            onClick={startDeploy}
            disabled={!userId || !gameName || !file}
            style={{ 
              width: '100%', 
              padding: '12px', 
              background: (!userId || !gameName || !file) ? '#ccc' : 'var(--primary-color)', 
              color: '#fff', 
              borderRadius: '4px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: (!userId || !gameName || !file) ? 'not-allowed' : 'pointer'
            }}
          >
            开始部署
          </button>
        </div>
      ) : (
        <div style={{ background: '#fff', padding: '24px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>部署日志</h2>
          <LogViewer 
            url="/api/deploy" 
            method="POST" 
            body={formData} 
            onComplete={() => setDeployComplete(true)}
            onError={(err) => setDeployError(err)}
          />

          {deployComplete && (
            <div style={{ marginTop: '24px', padding: '16px', backgroundColor: '#ecfdf5', border: '1px solid #10b981', borderRadius: '8px', textAlign: 'center' }}>
              <h3 style={{ color: '#047857', marginBottom: '8px' }}>🎉 部署成功！</h3>
              <p style={{ marginBottom: '16px', color: '#065f46' }}>游戏已经成功发布并可以在线访问了。</p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
                <a 
                  href={`/games/${userId}/${gameName}/`} 
                  target="_blank" 
                  rel="noreferrer"
                  style={{ padding: '8px 16px', background: 'var(--success-color)', color: '#fff', borderRadius: '4px', textDecoration: 'none' }}
                >
                  去玩游戏
                </a>
                <Link 
                  to={`/game/${encodeURIComponent(`${userId}/${gameName}`)}`}
                  style={{ padding: '8px 16px', background: '#fff', color: 'var(--text-color)', border: '1px solid var(--border-color)', borderRadius: '4px', textDecoration: 'none' }}
                >
                  查看详情
                </Link>
                <button 
                  onClick={() => {
                    setIsDeploying(false);
                    setFile(null);
                    setGameName('');
                  }}
                  style={{ padding: '8px 16px', background: '#f3f4f6', color: '#4b5563', borderRadius: '4px', border: '1px solid var(--border-color)' }}
                >
                  继续部署
                </button>
              </div>
            </div>
          )}

          {deployError && (
            <div style={{ marginTop: '24px', padding: '16px', backgroundColor: '#fef2f2', border: '1px solid #ef4444', borderRadius: '8px', textAlign: 'center' }}>
              <h3 style={{ color: '#b91c1c', marginBottom: '8px' }}>❌ 部署失败</h3>
              <p style={{ color: '#7f1d1d', marginBottom: '16px' }}>{deployError}</p>
              <button 
                onClick={() => setIsDeploying(false)}
                style={{ padding: '8px 16px', background: '#fff', color: 'var(--text-color)', border: '1px solid var(--border-color)', borderRadius: '4px' }}
              >
                返回修改
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}