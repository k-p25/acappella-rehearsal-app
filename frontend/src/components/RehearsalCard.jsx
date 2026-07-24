import { Link } from 'react-router-dom';

function formatDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(timeStr) {
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h, 10);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${m} ${suffix}`;
}

export default function RehearsalCard({ rehearsal }) {
  const isAbsent = !!rehearsal.my_absence;

  return (
    <Link
      to={`/rehearsals/${rehearsal.id}`}
      className="block bg-white rounded-lg border border-slate-200 p-4 hover:border-indigo-300 hover:shadow-sm transition"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="font-medium text-slate-900">
            {formatDate(rehearsal.date)} · {formatTime(rehearsal.start_time)}
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
