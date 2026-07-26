import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { roleLabel } from '../utils/roles';

const TABS = [
  { to: '/', label: 'Home', end: true },
  { to: '/rehearsals', label: 'Rehearsals' },
  { to: '/gigs', label: 'Gigs' },
  { to: '/music', label: 'Music' },
  { to: '/pr', label: 'PR' },
];

export default function Navbar() {
  const { user, logout } = useAuth();

  return (
    <nav className="border-b border-slate-200 bg-white">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-semibold text-slate-900 h-14 flex items-center">🎤 Acappella</span>
          <div className="flex items-center h-14 gap-1">
            {TABS.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                  }`
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-slate-500">{user?.name} {user?.role && `(${roleLabel(user.role)})`}</span>
          <button onClick={logout} className="text-slate-500 hover:text-slate-900 transition">
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}
