import { useEffect, useState } from 'react';
import api from '../api/client';
import Navbar from '../components/Navbar';
import MonthCalendar from '../components/MonthCalendar';
import WeekAtAGlance from '../components/WeekAtAGlance';
import OgAlertCard from '../components/OgAlertCard';
import NextGigCard from '../components/NextGigCard';
import { startOfWeek, toDateKey } from '../utils/date';

export default function DashboardPage() {
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedWeekStart, setSelectedWeekStart] = useState(startOfWeek(today));
  const [rehearsals, setRehearsals] = useState([]);
  const [gigs, setGigs] = useState([]);
  const [loading, setLoading] = useState(true);

  function loadData() {
    setLoading(true);
    Promise.all([api.get('/rehearsals'), api.get('/gigs')])
      .then(([rehearsalsRes, gigsRes]) => {
        setRehearsals(rehearsalsRes.data.rehearsals);
        setGigs(gigsRes.data.gigs);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadData();
  }, []);

  function handleSelectDate(date) {
    setSelectedWeekStart(startOfWeek(date));
    if (date.getMonth() !== viewDate.getMonth() || date.getFullYear() !== viewDate.getFullYear()) {
      setViewDate(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  }

  function goToPrevMonth() {
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }

  function goToNextMonth() {
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }

  const todayKey = toDateKey(today);
  const pendingGigs = gigs
    .filter((g) => (g.my_rsvp_status === 'pending' || g.my_rsvp_status == null) && g.date >= todayKey)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  const nextGig = gigs
    .filter((g) => g.date >= todayKey)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))[0] || null;

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-8">
        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_300px] gap-6 items-start">
            <MonthCalendar
              viewDate={viewDate}
              selectedWeekStart={selectedWeekStart}
              onSelectDate={handleSelectDate}
              onPrevMonth={goToPrevMonth}
              onNextMonth={goToNextMonth}
            />

            <WeekAtAGlance weekStart={selectedWeekStart} rehearsals={rehearsals} gigs={gigs} />

            <div className="space-y-6">
              <OgAlertCard pendingGigs={pendingGigs} onRsvpChange={loadData} />
              <NextGigCard gig={nextGig} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
