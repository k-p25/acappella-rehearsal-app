import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();

  return (
    <nav className="border-b border-slate-200 bg-white">
      <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/" className="font-semibold text-slate-900">🎤 Rehearsals</Link>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-slate-500">{user?.name} {user?.role === 'admin' && '(admin)'}</span>
          <button onClick={logout} className="text-slate-500 hover:text-slate-900 transition">
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}
