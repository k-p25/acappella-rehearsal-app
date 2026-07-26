import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import { canManageRehearsals, canApproveAttendance } from '../utils/permissions';
import { formatLongDate, formatTime } from '../utils/date';

const APPROVAL_STYLES = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  denied: 'bg-red-100 text-red-700',
};

const STATUS_LABELS = {
  present: 'Attending',
  absent_full: 'Missing entire rehearsal',
  absent_partial: 'Missing part of rehearsal',
  pending: 'No response yet',
};

export default function RehearsalDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [rehearsal, setRehearsal] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [status, setStatus] = useState('present');
  const [reason, setReason] = useState('');
  const [absentStartTime, setAbsentStartTime] = useState('');
  const [absentEndTime, setAbsentEndTime] = useState('');
  const [formError, setFormError] = useState('');

  function load() {
    setLoading(true);
    api.get(`/rehearsals/${id}`)
      .then((res) => {
        setRehearsal(res.data.rehearsal);
        setAttendance(res.data.attendance);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [id]);

  const myAttendance = attendance.find((a) => a.user_id === user?.id);
  const isDirector = canApproveAttendance(user);
  const reasonRequired = status !== 'present' && !isDirector;

  async function submitAttendance(e) {
    e.preventDefault();
    setFormError('');
    setBusy(true);
    try {
      await api.put(`/attendance/${id}`, {
        status,
        reason: reason || undefined,
        absentStartTime: status === 'absent_partial' ? absentStartTime : undefined,
        absentEndTime: status === 'absent_partial' ? absentEndTime : undefined,
      });
      setReason(''); setAbsentStartTime(''); setAbsentEndTime('');
      load();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Could not submit attendance.');
    } finally {
      setBusy(false);
    }
  }

  async function review(attendanceId, approvalStatus) {
    setBusy(true);
    try {
      await api.put(`/attendance/${attendanceId}/review`, { approvalStatus });
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

  const absentees = attendance.filter(
    (a) => (a.status === 'absent_full' || a.status === 'absent_partial') && a.approval_status !== 'denied'
  );
  const pendingApprovals = absentees.filter((a) => a.approval_status === 'pending');

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <button onClick={() => navigate('/')} className="text-sm text-slate-500 hover:text-slate-900 mb-4">
          ← Back to rehearsals
        </button>

        <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
          <h1 className="text-xl font-semibold text-slate-900">{formatLongDate(rehearsal.date)}</h1>
          <p className="text-slate-600 mt-1">
            {formatTime(rehearsal.start_time)}{rehearsal.end_time && ` – ${formatTime(rehearsal.end_time)}`} · {rehearsal.location}
          </p>
          {rehearsal.notes && <p className="text-sm text-slate-500 mt-2">{rehearsal.notes}</p>}

          {canManageRehearsals(user) && (
            <button onClick={deleteRehearsal} className="text-xs text-red-600 hover:text-red-700 mt-4">
              Delete rehearsal
            </button>
          )}
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
          <h2 className="font-medium text-slate-900 mb-3">Your attendance</h2>
          {myAttendance && myAttendance.status !== 'pending' && (
            <p className="text-sm text-slate-500 mb-3">
              Current: <span className="font-medium text-slate-700">{STATUS_LABELS[myAttendance.status]}</span>
              {myAttendance.status !== 'present' && (
                <span className={`ml-2 text-xs font-medium px-2 py-0.5 rounded-full ${APPROVAL_STYLES[myAttendance.approval_status]}`}>
                  {myAttendance.approval_status}
                </span>
              )}
            </p>
          )}

          <form onSubmit={submitAttendance} className="space-y-3">
            <div className="flex flex-col gap-1.5 text-sm text-slate-700">
              <label className="flex items-center gap-2">
                <input type="radio" checked={status === 'present'} onChange={() => setStatus('present')} />
                I'll be there
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={status === 'absent_full'} onChange={() => setStatus('absent_full')} />
                Missing the entire rehearsal
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={status === 'absent_partial'} onChange={() => setStatus('absent_partial')} />
                Missing part of the rehearsal
              </label>
            </div>

            {status === 'absent_partial' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Absent from</label>
                  <input type="time" required value={absentStartTime}
                    onChange={(e) => setAbsentStartTime(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Absent until</label>
                  <input type="time" required value={absentEndTime}
                    onChange={(e) => setAbsentEndTime(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
                </div>
              </div>
            )}

            {status !== 'present' && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Reason {reasonRequired ? '' : '(optional)'}
                </label>
                <input type="text" required={reasonRequired} value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why will you be missing rehearsal?"
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
              </div>
            )}

            {formError && <p className="text-sm text-red-600">{formError}</p>}
            <button type="submit" disabled={busy}
              className="text-sm bg-indigo-600 text-white px-4 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">
              {busy ? 'Saving…' : 'Submit'}
            </button>
          </form>
        </div>

        {isDirector && (
          <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
            <h2 className="font-medium text-slate-900 mb-3">
              Pending approvals ({pendingApprovals.length})
            </h2>
            {pendingApprovals.length === 0 ? (
              <p className="text-sm text-slate-400">Nothing to review.</p>
            ) : (
              <ul className="space-y-3">
                {pendingApprovals.map((a) => (
                  <li key={a.id} className="border-b border-slate-100 pb-3 last:border-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-800">{a.name}</span>
                      <span className="text-xs text-slate-500">{STATUS_LABELS[a.status]}</span>
                    </div>
                    {a.status === 'absent_partial' && (
                      <p className="text-xs text-slate-500 mt-1">
                        {formatTime(a.absent_start_time)} – {formatTime(a.absent_end_time)}
                      </p>
                    )}
                    {a.reason && <p className="text-sm text-slate-600 mt-1">"{a.reason}"</p>}
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => review(a.id, 'approved')} disabled={busy}
                        className="text-xs bg-emerald-600 text-white px-3 py-1 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition">
                        Approve
                      </button>
                      <button onClick={() => review(a.id, 'denied')} disabled={busy}
                        className="text-xs border border-slate-300 text-slate-700 px-3 py-1 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition">
                        Deny
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="font-medium text-slate-900 mb-3">
            Who's out ({absentees.length})
          </h2>
          {absentees.length === 0 ? (
            <p className="text-sm text-slate-400">Everyone's planning to be there. 🎶</p>
          ) : (
            <ul className="space-y-2">
              {absentees.map((a) => (
                <li key={a.id} className="text-sm flex items-baseline justify-between border-b border-slate-100 pb-2 last:border-0">
                  <span className="text-slate-800 font-medium">
                    {a.name} {a.voice_part && <span className="text-slate-400 font-normal">· {a.voice_part}</span>}
                    {a.status === 'absent_partial' && (
                      <span className="text-slate-400 font-normal"> · {formatTime(a.absent_start_time)}–{formatTime(a.absent_end_time)}</span>
                    )}
                  </span>
                  <span className="flex items-center gap-2">
                    {a.reason && <span className="text-slate-500">{a.reason}</span>}
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${APPROVAL_STYLES[a.approval_status]}`}>
                      {a.approval_status}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
