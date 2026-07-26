import { useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import RehearsalCard from '../components/RehearsalCard';
import AttendanceReviewQueue from '../components/AttendanceReviewQueue';
import { canManageRehearsals, canApproveAttendance } from '../utils/permissions';

const DAYS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

export default function RehearsalsPage() {
  const { user } = useAuth();
  const [rehearsals, setRehearsals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');

  const [repeats, setRepeats] = useState(false);
  const [daysOfWeek, setDaysOfWeek] = useState([]);
  const [endMode, setEndMode] = useState('until'); // 'until' | 'occurrences'
  const [until, setUntil] = useState('');
  const [occurrences, setOccurrences] = useState('');

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

  function toggleDay(day) {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const body = { date, startTime, endTime: endTime || undefined, location, notes: notes || undefined };
      if (repeats) {
        body.recurrence = {
          daysOfWeek,
          ...(endMode === 'until' ? { until } : { occurrences: Number(occurrences) }),
        };
      }
      await api.post('/rehearsals', body);
      setDate(''); setStartTime(''); setEndTime(''); setLocation(''); setNotes('');
      setRepeats(false); setDaysOfWeek([]); setUntil(''); setOccurrences('');
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
        {canApproveAttendance(user) && <AttendanceReviewQueue />}

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-slate-900">Next 3 upcoming rehearsals</h1>
          {canManageRehearsals(user) && (
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
            <div className="grid grid-cols-3 gap-3">
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
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">End time</label>
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)}
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

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={repeats} onChange={(e) => setRepeats(e.target.checked)} />
              Repeats weekly
            </label>

            {repeats && (
              <div className="bg-slate-50 rounded-lg p-3 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Repeat on</label>
                  <div className="flex gap-1">
                    {DAYS.map((d) => (
                      <button
                        type="button"
                        key={d.value}
                        onClick={() => toggleDay(d.value)}
                        className={`text-xs px-2 py-1 rounded-lg border transition ${
                          daysOfWeek.includes(d.value)
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm text-slate-700">
                  <label className="flex items-center gap-1.5">
                    <input type="radio" checked={endMode === 'until'} onChange={() => setEndMode('until')} />
                    Until date
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="radio" checked={endMode === 'occurrences'} onChange={() => setEndMode('occurrences')} />
                    Number of occurrences
                  </label>
                </div>
                {endMode === 'until' ? (
                  <input type="date" required value={until} onChange={(e) => setUntil(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
                ) : (
                  <input type="number" min="1" max="104" required value={occurrences}
                    onChange={(e) => setOccurrences(e.target.value)}
                    placeholder="e.g. 12"
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
                )}
              </div>
            )}

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
            {rehearsals.slice(0, 3).map((r) => (
              <RehearsalCard key={r.id} rehearsal={r} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
