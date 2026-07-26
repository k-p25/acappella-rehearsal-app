import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import { formatLongDate, formatTime } from '../utils/date';
import { canManageGigs, canViewDeclineReasons } from '../utils/permissions';

const STATUS_STYLES = {
  accepted: 'bg-emerald-100 text-emerald-700',
  declined: 'bg-red-100 text-red-700',
  pending: 'bg-amber-100 text-amber-700',
};

export default function GigDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [gig, setGig] = useState(null);
  const [rsvps, setRsvps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showDeclineForm, setShowDeclineForm] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [formError, setFormError] = useState('');

  function load() {
    setLoading(true);
    api.get(`/gigs/${id}`)
      .then((res) => {
        setGig(res.data.gig);
        setRsvps(res.data.rsvps);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [id]);

  const myRsvp = rsvps.find((r) => r.user_id === user?.id);

  async function respond(status) {
    if (status === 'declined') {
      setShowDeclineForm(true);
      return;
    }
    setBusy(true);
    try {
      await api.put(`/gigs/${id}/rsvp`, { status });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function submitDecline(e) {
    e.preventDefault();
    setFormError('');
    setBusy(true);
    try {
      await api.put(`/gigs/${id}/rsvp`, { status: 'declined', declineReason });
      setDeclineReason('');
      setShowDeclineForm(false);
      load();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Could not decline gig.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteGig() {
    if (!confirm('Delete this gig? This cannot be undone.')) return;
    await api.delete(`/gigs/${id}`);
    navigate('/gigs');
  }

  if (loading || !gig) {
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
        <button onClick={() => navigate('/gigs')} className="text-sm text-slate-500 hover:text-slate-900 mb-4">
          ← Back to gigs
        </button>

        <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
          <h1 className="text-xl font-semibold text-slate-900">{gig.title}</h1>
          <p className="text-slate-600 mt-1">
            {formatLongDate(gig.date)} · {formatTime(gig.time)}{gig.end_time && ` – ${formatTime(gig.end_time)}`}
          </p>
          <p className="text-sm text-slate-500 mt-1">{gig.venue}</p>

          {canManageGigs(user) && (
            <button onClick={deleteGig} className="text-xs text-red-600 hover:text-red-700 mt-4">
              Delete gig
            </button>
          )}
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
          <h2 className="font-medium text-slate-900 mb-3">Your RSVP</h2>
          <p className="text-sm text-slate-500 mb-3">
            Current status:{' '}
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[myRsvp?.status || 'pending']}`}>
              {myRsvp?.status === 'accepted' ? 'Accepted' : myRsvp?.status === 'declined' ? 'Declined' : 'Pending'}
            </span>
          </p>
          {!showDeclineForm ? (
            <div className="flex gap-2">
              <button onClick={() => respond('accepted')} disabled={busy || myRsvp?.status === 'accepted'}
                className="text-sm bg-emerald-600 text-white px-4 py-1.5 rounded-lg hover:bg-emerald-700 disabled:opacity-40 transition">
                Accept
              </button>
              <button onClick={() => respond('declined')} disabled={busy || myRsvp?.status === 'declined'}
                className="text-sm border border-slate-300 text-slate-700 px-4 py-1.5 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition">
                Decline
              </button>
            </div>
          ) : (
            <form onSubmit={submitDecline} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Reason for declining</label>
                <input type="text" required value={declineReason} onChange={(e) => setDeclineReason(e.target.value)}
                  placeholder="Why can't you make it?"
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
              </div>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <div className="flex gap-2">
                <button type="submit" disabled={busy}
                  className="text-sm bg-red-600 text-white px-4 py-1.5 rounded-lg hover:bg-red-700 disabled:opacity-40 transition">
                  {busy ? 'Saving…' : 'Confirm Decline'}
                </button>
                <button type="button" onClick={() => { setShowDeclineForm(false); setDeclineReason(''); setFormError(''); }} disabled={busy}
                  className="text-sm border border-slate-300 text-slate-700 px-4 py-1.5 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition">
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="font-medium text-slate-900 mb-3">
            Everyone's response ({rsvps.length})
          </h2>
          {rsvps.length === 0 ? (
            <p className="text-sm text-slate-400">No responses yet.</p>
          ) : (
            <ul className="space-y-2">
              {rsvps.map((r) => (
                <li key={r.id} className="text-sm border-b border-slate-100 pb-2 last:border-0">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-800 font-medium">
                      {r.name} {r.voice_part && <span className="text-slate-400 font-normal">· {r.voice_part}</span>}
                    </span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[r.status]}`}>
                      {r.status === 'accepted' ? 'Accepted' : r.status === 'declined' ? 'Declined' : 'Pending'}
                    </span>
                  </div>
                  {r.status === 'declined' && r.decline_reason && (
                    <p className="text-xs text-slate-500 mt-1">
                      {canViewDeclineReasons(user) && `Reason: ${r.decline_reason}`}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
