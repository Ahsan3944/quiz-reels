import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { Settings, Play, Home } from 'lucide-react';
import './index.css';
import './components.css';

import AdminPanel from './components/AdminPanel';
import QuizList from './components/QuizList';
import QuizPlayer from './components/QuizPlayer';

function App() {
  return (
    <Router>
      <header className="navbar glass-panel">
        <div className="logo-container">
          <Play size={28} className="text-primary" />
          <span className="logo-text">QuizReels</span>
        </div>
        <nav className="nav-links">
          <Link to="/" className="nav-link"><Home size={18}/> Home</Link>
          <Link to="/admin" className="nav-link"><Settings size={18}/> Admin</Link>
        </nav>
      </header>

      <main className="main-content">
        <Routes>
          <Route path="/" element={<QuizList />} />
          <Route path="/admin" element={<AdminPanel />} />
          <Route path="/edit/:id" element={<AdminPanel />} />
          <Route path="/play/:id" element={<QuizPlayer />} />
        </Routes>
      </main>
    </Router>
  );
}

export default App;
