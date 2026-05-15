import { useState, useRef, useEffect, DragEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import JSZip from 'jszip';
import LogViewer from '../components/LogViewer';
import { LogMessage } from '../types';
import { packFileListToZip } from '../utils/folderPack';
import { saveSourceName } from '../utils/folderHandle';

export default function Deploy() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [uploader, setUploader] = useState(() => searchParams.get('uploader') ?? '');
  const [displayName, setDisplayName] = useState(() => searchParams.get('displayName') ?? '');
  const [gameSlug, setGameSlug] = useState(() => searchParams.get('gameSlug') ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPacking, setIsPacking] = useState(false);

  const [isDeploying, setIsDeploying] = useState(false);
  const [deployComplete, setDeployComplete] = useState(false);
  const [deployError, setDeployError] = useState('');
  const [deployedGameId, setDeployedGameId] = useState('');
  const [zipFile, setZipFile] = useState<File | null>(null);

  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      navigate(`/game/${encodeURIComponent(deployedGameId)}`);
      return;
    }
    countdownRef.current = setInterval(() => {
      setCountdown(prev => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [countdown, deployedGameId, navigate]);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  async function wrapHtmlInZip(htmlFile: File): Promise<File> {
    const zip = new JSZip();
    zip.file('index.html', htmlFile);
    const blob = await zip.generateAsync({ type: 'blob' });
    return new File([blob], `${htmlFile.name.replace(/\.html?$/i, '')}.zip`, { type: 'application/zip' });
  }

  async function acceptFile(picked: File) {
    if (picked.name.toLowerCase().endsWith('.zip')) {
      setFile(picked);
      setZipFile(picked);
    } else if (picked.name.toLowerCase().match(/\.html?$/)) {
      setFile(picked);
      setZipFile(null);
      setIsPacking(true);
      try {
        const zipped = await wrapHtmlInZip(picked);
        setZipFile(zipped);
      } finally {
        setIsPacking(false);
      }
    } else {
      alert('只支持 .zip 或 .html 文件');
    }
  }

  async function acceptFolder(files: FileList) {
    if (files.length === 0) return;
    const folderName = (files[0] as File & { webkitRelativePath: string }).webkitRelativePath.split('/')[0] || files[0].name;
    setFile(new File([], folderName));
    setZipFile(null);
    setIsPacking(true);
    try {
      const zipped = await packFileListToZip(files);
      setZipFile(zipped);
    } finally {
      setIsPacking(false);
    }
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      acceptFile(e.dataTransfer.files[0]);
    }
  };

  const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      void acceptFolder(e.target.files);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      acceptFile(e.target.files[0]);
    }
  };

  const slugValid = /[a-z0-9]/i.test(gameSlug.trim());
  const canSubmit = uploader.trim() && slugValid && file && zipFile && !isPacking;

  const startDeploy = () => {
    if (!canSubmit) return;
    setIsDeploying(true);
    setDeployComplete(false);
    setDeployError('');
    setDeployedGameId('');
  };

  const formData = new FormData();
  if (isDeploying) {
    formData.append('userId', uploader.trim());
    formData.append('gameName', gameSlug.trim());
    formData.append('displayName', displayName.trim() || gameSlug.trim());
    if (zipFile) formData.append('file', zipFile);
  }

  const handleDeployDone = (msg: LogMessage) => {
    if (msg.ok && msg.gameId) {
      setDeployedGameId(msg.gameId);
      setDeployComplete(true);
      setCountdown(5);
      if (file) {
        saveSourceName(msg.gameId, file.name);
      }
    }
  };

  const resetForm = () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setIsDeploying(false);
    setUploader('');
    setFile(null);
    setZipFile(null);
    setGameSlug('');
    setDisplayName('');
    setDeployComplete(false);
    setDeployError('');
    setDeployedGameId('');
    setCountdown(null);
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '24px', marginBottom: '24px' }}>部署新游戏</h1>

      {!isDeploying ? (
        <div style={{ background: '#fff', padding: '24px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>你的名字</label>
            <input
              type="text"
              value={uploader}
              onChange={(e) => setUploader(e.target.value)}
              placeholder="例如: 小明"
              style={{ width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '4px', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>游戏名称</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="例如: 单词对对碰（展示用，可中文，选填）"
              style={{ width: '100%', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '4px', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              游戏标识 <span style={{ fontWeight: 'normal', color: '#6b7280', fontSize: '13px' }}>（用于生成访问链接，只能用英文字母、数字和连字符）</span>
            </label>
            <input
              type="text"
              value={gameSlug}
              onChange={(e) => setGameSlug(e.target.value)}
              placeholder="例如: word-match"
              style={{ width: '100%', padding: '10px', border: `1px solid ${gameSlug && !slugValid ? '#ef4444' : 'var(--border-color)'}`, borderRadius: '4px', boxSizing: 'border-box' }}
            />
            {gameSlug && !slugValid && (
              <div style={{ color: '#ef4444', fontSize: '13px', marginTop: '4px' }}>
                游戏标识必须包含至少一个英文字母或数字
              </div>
            )}
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>游戏文件</label>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => !isPacking && fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${isDragging ? 'var(--primary-color)' : 'var(--border-color)'}`,
                borderRadius: '8px',
                padding: '48px 24px',
                textAlign: 'center',
                backgroundColor: isDragging ? '#eff6ff' : '#f9fafb',
                cursor: isPacking ? 'wait' : 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <input
                type="file"
                accept=".zip,.html,.htm"
                ref={fileInputRef}
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              <input
                type="file"
                ref={folderInputRef}
                onChange={handleFolderChange}
                style={{ display: 'none' }}
                {...{ webkitdirectory: '', multiple: true } as React.InputHTMLAttributes<HTMLInputElement>}
              />
              {isPacking ? (
                <div>
                  <div style={{ fontSize: '48px', marginBottom: '8px' }}>⏳</div>
                  <div style={{ fontWeight: 'bold', color: '#4b5563' }}>正在打包 HTML 文件...</div>
                </div>
              ) : file ? (
                <div>
                  <div style={{ fontSize: '48px', marginBottom: '8px' }}>
                    {file.size === 0 ? '📁' : file.name.toLowerCase().match(/\.html?$/) ? '📄' : '📦'}
                  </div>
                  <div style={{ fontWeight: 'bold', color: 'var(--primary-color)' }}>{file.name}</div>
                  <div style={{ color: '#6b7280', fontSize: '14px', marginTop: '4px' }}>
                    {file.size === 0 ? (
                      <span style={{ color: '#10b981' }}>文件夹（已自动打包为 ZIP）</span>
                    ) : (
                      <>
                        {(file.size / 1024).toFixed(2)} KB
                        {file.name.toLowerCase().match(/\.html?$/) && (
                          <span style={{ marginLeft: '8px', color: '#10b981' }}>（已自动打包为 ZIP）</span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: '48px', marginBottom: '8px', color: '#9ca3af' }}>☁️</div>
                  <div style={{ fontWeight: 'bold', color: '#4b5563' }}>点击或拖拽文件到此处</div>
                  <div style={{ color: '#9ca3af', fontSize: '14px', marginTop: '4px' }}>支持 .zip 压缩包 或 .html 单文件</div>
                  <div style={{ marginTop: '12px' }}>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); folderInputRef.current?.click(); }}
                      style={{
                        padding: '6px 14px',
                        background: '#f3f4f6',
                        border: '1px solid var(--border-color)',
                        borderRadius: '4px',
                        color: '#4b5563',
                        fontSize: '13px',
                        cursor: 'pointer',
                      }}
                    >
                      📁 选择文件夹
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={startDeploy}
            disabled={!canSubmit}
            style={{
              width: '100%',
              padding: '12px',
              background: canSubmit ? 'var(--primary-color)' : '#ccc',
              color: '#fff',
              borderRadius: '4px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              border: 'none'
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
            onComplete={handleDeployDone}
            onError={(err) => setDeployError(err)}
          />

          {deployComplete && (
            <div style={{ marginTop: '24px', padding: '16px', backgroundColor: '#ecfdf5', border: '1px solid #10b981', borderRadius: '8px', textAlign: 'center' }}>
              <h3 style={{ color: '#047857', marginBottom: '8px' }}>🎉 部署成功！</h3>
              <p style={{ marginBottom: '4px', color: '#065f46' }}>游戏已经成功发布并可以在线访问了。</p>
              <p style={{ marginBottom: '16px', color: '#6b7280', fontSize: '14px' }}>
                {countdown !== null && countdown > 0
                  ? `${countdown} 秒后自动跳转到详情页...`
                  : '正在跳转...'}
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
                <a
                  href={`/games/${deployedGameId}/`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ padding: '8px 16px', background: 'var(--success-color)', color: '#fff', borderRadius: '4px', textDecoration: 'none' }}
                >
                  去玩游戏
                </a>
                <Link
                  to={`/game/${encodeURIComponent(deployedGameId)}`}
                  onClick={() => { if (countdownRef.current) clearInterval(countdownRef.current); }}
                  style={{ padding: '8px 16px', background: '#fff', color: 'var(--text-color)', border: '1px solid var(--border-color)', borderRadius: '4px', textDecoration: 'none' }}
                >
                  立即查看详情
                </Link>
                <button
                  onClick={resetForm}
                  style={{ padding: '8px 16px', background: '#f3f4f6', color: '#4b5563', borderRadius: '4px', border: '1px solid var(--border-color)', cursor: 'pointer' }}
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
                style={{ padding: '8px 16px', background: '#fff', color: 'var(--text-color)', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer' }}
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
