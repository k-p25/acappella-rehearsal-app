import { toDateKey, startOfWeek, addDays } from '../utils/date';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_LABEL = { month: 'long', year: 'numeric' };

function buildGrid(viewDate) {
  const firstOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const gridStart = startOfWeek(firstOfMonth);
  const days = [];
  for (let i = 0; i < 42; i++) {
    days.push(addDays(gridStart, i));
  }
  return days;
}

export default function MonthCalendar({ viewDate, selectedWeekStart, onSelectDate, onPrevMonth, onNextMonth }) {
  const days = buildGrid(viewDate);
  const todayKey = toDateKey(new Date());
  const selectedWeekEnd = addDays(selectedWeekStart, 6);

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <button onClick={onPrevMonth} className="text-slate-400 hover:text-slate-700 px-1.5 transition" aria-label="Previous month">
          ‹
        </button>
        <p className="text-sm font-semibold text-slate-900">
          {viewDate.toLocaleDateString('en-US', MONTH_LABEL)}
        </p>
        <button onClick={onNextMonth} className="text-slate-400 hover:text-slate-700 px-1.5 transition" aria-label="Next month">
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAY_LABELS.map((label, i) => (
          <span key={i} className="text-[11px] font-medium text-slate-400">{label}</span>
        ))}
        {days.map((day) => {
          const key = toDateKey(day);
          const inCurrentMonth = day.getMonth() === viewDate.getMonth();
          const isToday = key === todayKey;
          const inSelectedWeek = day >= selectedWeekStart && day <= selectedWeekEnd;

          return (
            <button
              key={key}
              onClick={() => onSelectDate(day)}
              className={[
                'h-8 w-8 mx-auto flex items-center justify-center text-xs rounded-full transition',
                inCurrentMonth ? 'text-slate-700' : 'text-slate-300',
                inSelectedWeek ? 'bg-indigo-100' : 'hover:bg-slate-100',
                isToday ? 'ring-2 ring-indigo-500 font-semibold' : '',
              ].join(' ')}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
