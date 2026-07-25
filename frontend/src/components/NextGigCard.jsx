import { Link } from 'react-router-dom';
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

export default function NextGigCard({ gig }) {
  const status = gig?.my_rsvp_status || 'pending';

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <h2 className="text-sm font-semibold text-slate-900 mb-3">🎤 Next upcoming gig</h2>
      {!gig ? (
        <p className="text-sm text-slate-400">No gigs on the books yet.</p>
      ) : (
        <Link to={`/gigs/${gig.id}`} className="block">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium text-slate-900">{gig.title}</p>
              <p className="text-sm text-slate-500 mt-0.5">{formatShortDate(gig.date)} · {formatTime(gig.time)}</p>
              <p className="text-sm text-slate-400">{gig.venue}</p>
            </div>
            <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[status]}`}>
              {STATUS_LABELS[status]}
            </span>
          </div>
        </Link>
      )}
    </div>
  );
}
