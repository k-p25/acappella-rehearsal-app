import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { formatShortDate, formatTime } from '../utils/date';

const STATUS_STYLES = {
  accepted: 'bg-emerald-100 text-emerald-700',
  declined: 'bg-red-100 text-red-700',
  pending: 'bg-amber-100 text-amber-700',
};

const STATUS_LABELS = {
  accepted: 'Accepted',
  declined: 'Declined',
  pending: 'Pending',
};

export default function GigCard({ gig, onRsvpChange }) {
  const [busy, setBusy] = useState(false);
  const status = gig.my_rsvp_status || 'pending';

  async function respond(newStatus) {
    setBusy(true);
    try {
      await api.put(`/gigs/${gig.id}/rsvp`, { status: newStatus });
      onRsvpChange?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 hover:border-indigo-300 hover:shadow-sm transition">
      <div className="flex items-start justify-between gap-4">
        <Link to={`/gigs/${gig.id}`} className="min-w-0">
          <p className="font-medium text-slate-900">{gig.title}</p>
          <p className="text-sm text-slate-500 mt-0.5">
            {formatShortDate(gig.date)} · {formatTime(gig.time)}
          </p>
          <p className="text-sm text-slate-400 mt-0.5">{gig.venue}</p>
        </Link>
        <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[status]}`}>
          {STATUS_LABELS[status]}
        </span>
      </div>

      <div className="flex gap-2 mt-3">
        <button
          onClick={() => respond('accepted')}
          disabled={busy || status === 'accepted'}
          className="text-sm bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 disabled:opacity-40 transition"
        >
          Accept
        </button>
        <button
          onClick={() => respond('declined')}
          disabled={busy || status === 'declined'}
          className="text-sm border border-slate-300 text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition"
        >
          Decline
        </button>
      </div>
    </div>
  );
}
