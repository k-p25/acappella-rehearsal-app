import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { formatShortDate, formatTime } from '../utils/date';

export default function OgAlertCard({ pendingGigs, onRsvpChange }) {
  const [expanded, setExpanded] = useState(false);
  const [busyId, setBusyId] = useState(null);

  async function respond(gigId, status) {
    setBusyId(gigId);
    try {
      await api.put(`/gigs/${gigId}/rsvp`, { status });
      onRsvpChange?.();
    } finally {
      setBusyId(null);
    }
  }

  const top = pendingGigs[0];

  return (
    <div className="bg-white rounded-lg border border-amber-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-amber-800">🔔 OG Alert</h2>
        {pendingGigs.length > 1 && (
          <button onClick={() => setExpanded(!expanded)} className="text-xs text-indigo-600 hover:text-indigo-700">
            {expanded ? 'Hide' : `See all (${pendingGigs.length})`}
          </button>
        )}
      </div>

      {!top ? (
        <p className="text-sm text-slate-400">No pending RSVPs — you're all caught up.</p>
      ) : !expanded ? (
        <div>
          <Link to={`/gigs/${top.id}`} className="block">
            <p className="font-medium text-slate-900">{top.title}</p>
            <p className="text-sm text-slate-500 mt-0.5">{formatShortDate(top.date)} · {formatTime(top.time)}</p>
            <p className="text-sm text-slate-400">{top.venue}</p>
          </Link>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => respond(top.id, 'accepted')}
              disabled={busyId === top.id}
              className="text-sm bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 disabled:opacity-40 transition"
            >
              Accept
            </button>
            <button
              onClick={() => respond(top.id, 'declined')}
              disabled={busyId === top.id}
              className="text-sm border border-slate-300 text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition"
            >
              Decline
            </button>
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {pendingGigs.map((gig) => (
            <li key={gig.id} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
              <Link to={`/gigs/${gig.id}`} className="block">
                <p className="text-sm font-medium text-slate-900">{gig.title}</p>
                <p className="text-xs text-slate-500 mt-0.5">{formatShortDate(gig.date)} · {formatTime(gig.time)}</p>
              </Link>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => respond(gig.id, 'accepted')}
                  disabled={busyId === gig.id}
                  className="text-xs bg-emerald-600 text-white px-2.5 py-1 rounded-lg hover:bg-emerald-700 disabled:opacity-40 transition"
                >
                  Accept
                </button>
                <button
                  onClick={() => respond(gig.id, 'declined')}
                  disabled={busyId === gig.id}
                  className="text-xs border border-slate-300 text-slate-700 px-2.5 py-1 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition"
                >
                  Decline
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
