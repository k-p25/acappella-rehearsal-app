import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatShortDate, formatTime } from '../utils/date';

export default function OgAlertCard({ pendingGigs }) {
  const [expanded, setExpanded] = useState(false);

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
          <Link to={`/gigs/${top.id}`} className="block mb-3">
            <p className="font-medium text-slate-900">{top.title}</p>
            <p className="text-sm text-slate-500 mt-0.5">{formatShortDate(top.date)} · {formatTime(top.time)}</p>
            <p className="text-sm text-slate-400">{top.venue}</p>
          </Link>
          <Link to={`/gigs/${top.id}`} className="inline-block">
            <button className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition">
              Change status
            </button>
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {pendingGigs.map((gig) => (
            <li key={gig.id} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
              <Link to={`/gigs/${gig.id}`} className="block mb-2">
                <p className="text-sm font-medium text-slate-900">{gig.title}</p>
                <p className="text-xs text-slate-500 mt-0.5">{formatShortDate(gig.date)} · {formatTime(gig.time)}</p>
              </Link>
              <Link to={`/gigs/${gig.id}`} className="inline-block">
                <button className="text-xs bg-indigo-600 text-white px-2.5 py-1 rounded-lg hover:bg-indigo-700 transition">
                  Change status
                </button>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
