import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import GameList from './pages/GameList'
import Deploy from './pages/Deploy'
import GameDetail from './pages/GameDetail'

function Navigation() {
  const location = useLocation();
  
  return (
    <header className="app-header">
      <h2>游戏托管平台</h2>
      <nav className="app-header-nav">
        <Link to="/" className={location.pathname === '/' ? 'active' : ''}>游戏列表</Link>
        <Link to="/deploy" className={location.pathname === '/deploy' ? 'active' : ''}>部署游戏</Link>
      </nav>
    </header>
  );
}

function App() {
  return (
    <BrowserRouter>
      <div className="app-container">
        <Navigation />
        <main className="app-main">
          <Routes>
            <Route path="/" element={<GameList />} />
            <Route path="/deploy" element={<Deploy />} />
            <Route path="/game/:gameId" element={<GameDetail />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App