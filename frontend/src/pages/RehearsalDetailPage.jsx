import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';

function formatDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export default function RehearsalDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [rehearsal, setRehearsal] = useState(null);
  const [absences, setAbsences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState('');
  const [showReasonInput, setShowReasonInput] = useState(false);
  const [busy, setBusy] = useState(false);

  function load() {
    setLoading(true);
    api.get(`/rehearsals/${id}`)
      .then((res) => {
        setRehearsal(res.data.rehearsal);
        setAbsences(res.data.absences);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [id]);

  const myAbsence = absences.find((a) => a.user_id === user?.id);

  async function markAbsent() {
    setBusy(true);
    try {
      await api.post('/absences', { rehearsalId: id, reason: reason || undefined });
      setReason('');
      setShowReasonInput(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function unmarkAbsent() {
    setBusy(true);
    try {
      await api.delete(`/absences/${id}`);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function deleteRehearsal() {
    if (!confirm('Delete this rehearsal? This cannot be undone.')) return;
    await api.delete(`/rehearsals/${id}`);
    navigate('/');
  }

  if (loading || !rehearsal) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <main className="max-w-2xl mx-auto px-4 py-8">
          <p className="text-sm text-slate-400">Loading…</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <button onClick={() => navigate('/')} className="text-sm text-slate-500 hover:text-slate-900 mb-4">
          ← Back to rehearsals
        </button>

        <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
          <h1 className="text-xl font-semibold text-slate-900">{formatDate(rehearsal.date)}</h1>
          <p className="text-slate-600 mt-1">
            {rehearsal.start_time}{rehearsal.end_time && ` – ${rehearsal.end_time}`} · {rehearsal.location}
          </p>
          {rehearsal.notes && <p className="text-sm text-slate-500 mt-2">{rehearsal.notes}</p>}

          {user?.role === 'admin' && (
            <button onClick={deleteRehearsal} className="text-xs text-red-600 hover:text-red-700 mt-4">
              Delete rehearsal
            </button>
          )}
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
          <h2 className="font-medium text-slate-900 mb-3">Your attendance</h2>
          {myAbsence ? (
            <div>
              <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-3">
                You're marked as not attending{myAbsence.reason ? `: "${myAbsence.reason}"` : '.'}
              </p>
              <button onClick={unmarkAbsent} disabled={busy}
                className="text-sm bg-slate-900 text-white px-4 py-1.5 rounded-lg hover:bg-slate-800 disabled:opacity-50 transition">
                {busy ? 'Updating…' : "Actually, I'll be there"}
              </button>
            </div>
          ) : showReasonInput ? (
            <div className="space-y-2">
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason (optional)"
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              />
              <div className="flex gap-2">
                <button onClick={markAbsent} disabled={busy}
                  className="text-sm bg-amber-600 text-white px-4 py-1.5 rounded-lg hover:bg-amber-700 disabled:opacity-50 transition">
                  {busy ? 'Saving…' : 'Confirm absence'}
                </button>
                <button onClick={() => setShowReasonInput(false)}
                  className="text-sm text-slate-500 hover:text-slate-700 px-2">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowReasonInput(true)}
              className="text-sm border border-slate-300 px-4 py-1.5 rounded-lg hover:bg-slate-50 transition">
              I can't make it
            </button>
          )}
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="font-medium text-slate-900 mb-3">
            Who's out ({absences.length})
          </h2>
          {absences.length === 0 ? (
            <p className="text-sm text-slate-400">Everyone's planning to be there. 🎶</p>
          ) : (
            <ul className="space-y-2">
              {absences.map((a) => (
                <li key={a.id} className="text-sm flex items-baseline justify-between border-b border-slate-100 pb-2 last:border-0">
                  <span className="text-slate-800 font-medium">
                    {a.name} {a.voice_part && <span className="text-slate-400 font-normal">· {a.voice_part}</span>}
                  </span>
                  {a.reason && <span className="text-slate-500">{a.reason}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
