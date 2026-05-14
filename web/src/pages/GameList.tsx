import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Game } from '../types';

export default function GameList() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTag, setSelectedTag] = useState('');

  useEffect(() => {
    fetch('/api/games')
      .then(res => res.json())
      .then(data => {
        setGames(data || []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const allTags = Array.from(new Set(games.flatMap(g => g.tags || [])));

  const filteredGames = games.filter(g => {
    const matchName = g.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                      g.user_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchTag = selectedTag ? (g.tags || []).includes(selectedTag) : true;
    return matchName && matchTag;
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px' }}>游戏列表</h1>
        <Link to="/deploy" style={{ padding: '8px 16px', background: 'var(--primary-color)', color: '#fff', borderRadius: '4px', textDecoration: 'none' }}>
          发布新游戏
        </Link>
      </div>

      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
        <input 
          type="text" 
          placeholder="搜索游戏名或用户..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '4px', width: '300px' }}
        />
        <select 
          value={selectedTag} 
          onChange={(e) => setSelectedTag(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '4px' }}
        >
          <option value="">所有标签</option>
          {allTags.map(tag => (
            <option key={tag} value={tag}>{tag}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div>加载中...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
          {filteredGames.map(game => (
            <Link key={game.id} to={`/game/${encodeURIComponent(game.id)}`} style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
              <div style={{ 
                border: '1px solid var(--border-color)', 
                borderRadius: '8px', 
                overflow: 'hidden',
                backgroundColor: '#fff',
                transition: 'transform 0.2s, box-shadow 0.2s',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = 'none';
              }}
              >
                <div style={{ height: '160px', backgroundColor: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {game.cover_url ? (
                    <img src={game.cover_url} alt={game.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ color: '#9ca3af', fontSize: '48px' }}>🎮</span>
                  )}
                </div>
                <div style={{ padding: '16px' }}>
                  <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', color: 'var(--primary-color)' }}>{game.name}</h3>
                  <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '12px' }}>
                    开发者: {game.user_name}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {(game.tags || []).map(tag => (
                      <span key={tag} style={{ background: '#f3f4f6', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', color: '#4b5563' }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </Link>
          ))}
          {filteredGames.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '48px', color: '#6b7280' }}>
              没有找到匹配的游戏
            </div>
          )}
        </div>
      )}
    </div>
  );
}