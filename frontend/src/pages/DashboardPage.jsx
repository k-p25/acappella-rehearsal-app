import { useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import RehearsalCard from '../components/RehearsalCard';

export default function DashboardPage() {
  const { user } = useAuth();
  const [rehearsals, setRehearsals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];

  function loadRehearsals() {
    setLoading(true);
    api.get('/rehearsals', { params: { from: todayStr } })
      .then((res) => setRehearsals(res.data.rehearsals))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadRehearsals();
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/rehearsals', { date, startTime, location, notes: notes || undefined });
      setDate(''); setStartTime(''); setLocation(''); setNotes('');
      setShowForm(false);
      loadRehearsals();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create rehearsal.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-slate-900">Upcoming rehearsals</h1>
          {user?.role === 'admin' && (
            <button
              onClick={() => setShowForm(!showForm)}
              className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition"
            >
              {showForm ? 'Cancel' : '+ New rehearsal'}
            </button>
          )}
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="bg-white rounded-lg border border-slate-200 p-4 mb-6 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Date</label>
                <input type="date" required value={date} onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Start time</label>
                <input type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Location</label>
              <input type="text" required value={location} onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Choir Room 2"
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Notes (optional)</label>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Bring folders, run the new arrangement"
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={submitting}
              className="bg-indigo-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">
              {submitting ? 'Creating…' : 'Create rehearsal'}
            </button>
          </form>
        )}

        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : rehearsals.length === 0 ? (
          <p className="text-sm text-slate-400">No upcoming rehearsals scheduled yet.</p>
        ) : (
          <div className="space-y-3">
            {rehearsals.map((r) => (
              <RehearsalCard key={r.id} rehearsal={r} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
