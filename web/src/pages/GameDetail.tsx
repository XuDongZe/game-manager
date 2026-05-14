import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Game, Version } from '../types';
import VersionHistory from '../components/VersionHistory';

export default function GameDetail() {
  const { gameId } = useParams<{ gameId: string }>();
  const [game, setGame] = useState<Game | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);

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
            <h1 style={{ fontSize: '32px', margin: '0 0 16px 0' }}>{game.name}</h1>
            <a 
              href={`/games/${game.user_name}/${game.name}/`} 
              target="_blank" 
              rel="noreferrer"
              style={{ padding: '8px 24px', background: 'var(--success-color)', color: '#fff', borderRadius: '4px', textDecoration: 'none', fontWeight: 'bold' }}
            >
              在线试玩 ↗
            </a>
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
            src={`/games/${game.user_name}/${game.name}/`} 
            title={game.name}
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