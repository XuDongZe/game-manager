import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Game, Version } from '../types';
import VersionHistory from '../components/VersionHistory';

export default function GameDetail() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const [game, setGame] = useState<Game | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [lockLoading, setLockLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchGameData = useCallback(() => {
    if (!gameId) return;

    Promise.all([
      fetch(`/api/games/${encodeURIComponent(gameId)}`).then(res => res.json()),
      fetch(`/api/games/${encodeURIComponent(gameId)}/versions`).then(res => res.json())
    ])
    .then(([gameData, versionsData]) => {
      setGame(gameData);
      setVersions(versionsData || []);
      setLoading(false);
    })
    .catch(err => {
      console.error(err);
      setLoading(false);
    });
  }, [gameId]);

  useEffect(() => {
    fetchGameData();
  }, [fetchGameData]);

  const handleToggleLock = useCallback(async () => {
    if (!game || !gameId) return;
    setLockLoading(true);
    try {
      await fetch(`/api/games/${encodeURIComponent(gameId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locked: !game.locked }),
      });
      await fetchGameData();
    } finally {
      setLockLoading(false);
    }
  }, [game, gameId, fetchGameData]);

  const handleDelete = useCallback(async () => {
    if (!game || !gameId) return;
    if (!window.confirm(`确定要删除游戏「${game.name}」吗？\n\n此操作不可恢复，游戏数据和版本历史将被永久删除。`)) return;
    if (!window.confirm(`再次确认：永久删除「${game.name}」？`)) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/games/${encodeURIComponent(gameId)}`, { method: 'DELETE' });
      if (res.ok) {
        navigate('/');
      } else {
        const data = await res.json() as { error?: string };
        alert(data.error ?? '删除失败');
      }
    } finally {
      setDeleteLoading(false);
    }
  }, [game, gameId, navigate]);

  if (loading) {
    return <div>加载中...</div>;
  }

  if (!game) {
    return (
      <div style={{ textAlign: 'center', padding: '48px' }}>
        <h2>找不到该游戏</h2>
        <Link to="/" style={{ color: 'var(--primary-color)', marginTop: '16px', display: 'inline-block' }}>返回列表</Link>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <Link to="/" style={{ color: '#6b7280', textDecoration: 'none' }}>← 返回列表</Link>
      </div>

      <div style={{ display: 'flex', gap: '24px', marginBottom: '32px' }}>
        <div style={{ width: '200px', height: '200px', backgroundColor: '#e5e7eb', borderRadius: '8px', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {game.cover_url ? (
            <img src={game.cover_url} alt={game.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: '64px' }}>🎮</span>
          )}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h1 style={{ fontSize: '32px', margin: '0 0 16px 0' }}>
              {game.locked && <span title="已锁定，禁止删除" style={{ marginRight: '8px', fontSize: '24px' }}>🔒</span>}
              {game.name}
            </h1>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                type="button"
                onClick={handleToggleLock}
                disabled={lockLoading}
                title={game.locked ? '解锁游戏（解锁后可删除）' : '锁定游戏（防止误删）'}
                style={{
                  padding: '8px 16px',
                  background: game.locked ? '#f59e0b' : '#6b7280',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: lockLoading ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  opacity: lockLoading ? 0.7 : 1,
                }}
              >
                {lockLoading ? '处理中...' : game.locked ? '🔓 解锁' : '🔒 锁定'}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteLoading || game.locked}
                title={game.locked ? '请先解锁才能删除' : '删除游戏'}
                style={{
                  padding: '8px 16px',
                  background: game.locked ? '#e5e7eb' : '#ef4444',
                  color: game.locked ? '#9ca3af' : '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: (deleteLoading || game.locked) ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  opacity: deleteLoading ? 0.7 : 1,
                }}
              >
                {deleteLoading ? '删除中...' : '🗑️ 删除'}
              </button>
              <a
                href={`/games/${game.id}/`}
                target="_blank"
                rel="noreferrer"
                style={{ padding: '8px 24px', background: 'var(--success-color)', color: '#fff', borderRadius: '4px', textDecoration: 'none', fontWeight: 'bold' }}
              >
                在线试玩 ↗
              </a>
            </div>
          </div>

          <div style={{ marginBottom: '16px', color: '#4b5563', fontSize: '16px' }}>
            <p style={{ margin: '0 0 8px 0' }}><strong>开发者:</strong> {game.user_name}</p>
            <p style={{ margin: '0 0 8px 0' }}><strong>游戏 ID:</strong> {game.id}</p>
            <p style={{ margin: '0 0 8px 0' }}><strong>创建时间:</strong> {new Date(game.created_at).toLocaleString()}</p>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {(game.tags || []).map(tag => (
              <span key={tag} style={{ background: '#f3f4f6', padding: '4px 12px', borderRadius: '16px', fontSize: '14px', color: '#4b5563', border: '1px solid var(--border-color)' }}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div style={{ background: '#fff', padding: '24px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
        <h3 style={{ marginBottom: '16px', fontSize: '18px' }}>游戏预览</h3>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden', height: '600px', backgroundColor: '#000' }}>
          <iframe
            src={`/games/${game.id}/`}
            title={game.name}
            sandbox="allow-scripts allow-same-origin"
            style={{ width: '100%', height: '100%', border: 'none' }}
          />
        </div>
      </div>

      <VersionHistory
        gameId={game.id}
        versions={versions}
        onRefresh={fetchGameData}
      />
    </div>
  );
}
