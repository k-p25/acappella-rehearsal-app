import { Link } from 'react-router-dom';
import { formatShortDate, formatTime } from '../utils/date';

export default function RehearsalCard({ rehearsal }) {
  const isAbsent =
    (rehearsal.my_attendance?.status === 'absent_full' || rehearsal.my_attendance?.status === 'absent_partial') &&
    rehearsal.my_attendance?.approval_status !== 'denied';

  return (
    <Link
      to={`/rehearsals/${rehearsal.id}`}
      className="block bg-white rounded-lg border border-slate-200 p-4 hover:border-indigo-300 hover:shadow-sm transition"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="font-medium text-slate-900">
            {formatShortDate(rehearsal.date)} · {formatTime(rehearsal.start_time)}
            {rehearsal.end_time && ` – ${formatTime(rehearsal.end_time)}`}
          </p>
          <p className="text-sm text-slate-500 mt-0.5">{rehearsal.location}</p>
          {rehearsal.notes && (
            <p className="text-sm text-slate-400 mt-1">{rehearsal.notes}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          {isAbsent && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
              You're out
            </span>
          )}
          {rehearsal.absence_count > 0 && (
            <span className="text-xs text-slate-400">
              {rehearsal.absence_count} absent
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
