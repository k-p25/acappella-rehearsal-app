import { useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import GigCard from '../components/GigCard';
import { canManageGigs } from '../utils/permissions';

export default function GigsPage() {
  const { user } = useAuth();
  const [gigs, setGigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [venue, setVenue] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function loadGigs() {
    setLoading(true);
    api.get('/gigs')
      .then((res) => setGigs(res.data.gigs))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadGigs();
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/gigs', { title, date, time, endTime: endTime || undefined, venue });
      setTitle(''); setDate(''); setTime(''); setEndTime(''); setVenue('');
      setShowForm(false);
      loadGigs();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create gig.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-slate-900">Gigs</h1>
          {canManageGigs(user) && (
            <button
              onClick={() => setShowForm(!showForm)}
              className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition"
            >
              {showForm ? 'Cancel' : '+ New gig'}
            </button>
          )}
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="bg-white rounded-lg border border-slate-200 p-4 mb-6 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Title</label>
              <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Fall Showcase"
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Date</label>
                <input type="date" required value={date} onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Start time</label>
                <input type="time" required value={time} onChange={(e) => setTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">End time</label>
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Venue</label>
              <input type="text" required value={venue} onChange={(e) => setVenue(e.target.value)}
                placeholder="e.g. Main Hall"
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={submitting}
              className="bg-indigo-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">
              {submitting ? 'Creating…' : 'Create gig'}
            </button>
          </form>
        )}

        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : gigs.length === 0 ? (
          <p className="text-sm text-slate-400">No gigs scheduled yet.</p>
        ) : (
          <div className="space-y-3">
            {gigs.map((g) => (
              <GigCard key={g.id} gig={g} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
