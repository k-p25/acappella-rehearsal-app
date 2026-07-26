import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { formatShortDate, formatTime } from '../utils/date';

export default function AttendanceReviewQueue() {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  function load() {
    setLoading(true);
    api.get('/attendance/pending')
      .then((res) => setPending(res.data.attendance))
      .catch(() => setPending([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function review(attendanceId, approvalStatus) {
    setBusy(attendanceId);
    try {
      await api.put(`/attendance/${attendanceId}/review`, { approvalStatus });
      load();
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
      <h2 className="font-semibold text-slate-900 mb-3">
        Absence requests pending review ({pending.length})
      </h2>
      {pending.length === 0 ? (
        <p className="text-sm text-slate-400">No pending requests.</p>
      ) : (
        <ul className="space-y-3">
          {pending.map((a) => (
            <li key={a.id} className="border-b border-slate-100 pb-3 last:border-0">
              <Link to={`/rehearsals/${a.rehearsal_id}`} className="block mb-2">
                <p className="text-sm font-medium text-slate-800">{a.name}</p>
                <p className="text-xs text-slate-500">
                  {formatShortDate(a.date)} · {formatTime(a.start_time)}
                  {a.end_time && ` – ${formatTime(a.end_time)}`} · {a.location}
                </p>
              </Link>
              {a.status === 'absent_partial' && (
                <p className="text-xs text-slate-500 mb-2">
                  Requesting: {formatTime(a.absent_start_time)}–{formatTime(a.absent_end_time)}
                </p>
              )}
              {a.reason && (
                <p className="text-sm text-slate-600 mb-2">"{a.reason}"</p>
              )}
              <p className="text-xs text-slate-400 mb-2">
                Submitted: {new Date(a.created_at).toLocaleDateString()}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => review(a.id, 'approved')}
                  disabled={busy === a.id}
                  className="text-xs bg-emerald-600 text-white px-3 py-1 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition"
                >
                  {busy === a.id ? 'Saving…' : 'Approve'}
                </button>
                <button
                  onClick={() => review(a.id, 'denied')}
                  disabled={busy === a.id}
                  className="text-xs border border-slate-300 text-slate-700 px-3 py-1 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition"
                >
                  {busy === a.id ? 'Saving…' : 'Deny'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
