import { Link } from 'react-router-dom';
import { addDays, toDateKey, formatTime } from '../utils/date';

const DAY_LABEL = { weekday: 'short', month: 'short', day: 'numeric' };

export default function WeekAtAGlance({ weekStart, rehearsals, gigs }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const todayKey = toDateKey(new Date());

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <h2 className="text-sm font-semibold text-slate-900 mb-3">Week at a glance</h2>
      <div className="grid grid-cols-7 gap-2">
        {days.map((day) => {
          const key = toDateKey(day);
          const isToday = key === todayKey;

          const entries = [
            ...rehearsals.filter((r) => r.date === key).map((r) => ({
              id: `r-${r.id}`,
              time: r.start_time,
              label: r.location,
              type: 'rehearsal',
              to: `/rehearsals/${r.id}`,
            })),
            ...gigs.filter((g) => g.date === key).map((g) => ({
              id: `g-${g.id}`,
              time: g.time,
              label: g.title,
              type: 'gig',
              to: `/gigs/${g.id}`,
            })),
          ].sort((a, b) => a.time.localeCompare(b.time));

          return (
            <div key={key} className={`min-h-[160px] rounded-lg border p-2 ${isToday ? 'border-indigo-300 bg-indigo-50/40' : 'border-slate-100'}`}>
              <p className={`text-[11px] font-medium mb-1.5 ${isToday ? 'text-indigo-700' : 'text-slate-500'}`}>
                {day.toLocaleDateString('en-US', DAY_LABEL)}
              </p>
              <div className="space-y-1">
                {entries.length === 0 ? (
                  <p className="text-[11px] text-slate-300">—</p>
                ) : (
                  entries.map((entry) => (
                    <Link
                      key={entry.id}
                      to={entry.to}
                      className={`block text-[11px] leading-tight rounded px-1.5 py-1 truncate transition ${
                        entry.type === 'gig'
                          ? 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                          : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                      }`}
                      title={`${formatTime(entry.time)} · ${entry.label}`}
                    >
                      {formatTime(entry.time)} {entry.label}
                    </Link>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
