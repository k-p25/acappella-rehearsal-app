import { useEffect, useState } from 'react';
import api from '../api/client';
import { formatShortDate } from '../utils/date';

export default function AttendanceDecisionBanner() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    api.get('/attendance/mine/notifications')
      .then((res) => setNotifications(res.data.notifications))
      .catch(() => setNotifications([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function dismiss(id) {
    try {
      await api.put(`/attendance/${id}/acknowledge`);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      console.error('Failed to dismiss notification:', err);
    }
  }

  if (loading || notifications.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2 mb-6">
      {notifications.map((n) => (
        <div key={n.id} className={`rounded-lg border p-4 flex items-start justify-between ${
          n.approval_status === 'approved'
            ? 'bg-emerald-50 border-emerald-200'
            : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex-1">
            <p className={`text-sm font-medium ${
              n.approval_status === 'approved' ? 'text-emerald-900' : 'text-red-900'
            }`}>
              Your absence request for {formatShortDate(n.date)} has been{' '}
              <span className="font-semibold">{n.approval_status}</span>.
            </p>
            <p className={`text-xs mt-1 ${
              n.approval_status === 'approved' ? 'text-emerald-700' : 'text-red-700'
            }`}>
              {n.location}
            </p>
          </div>
          <button
            onClick={() => dismiss(n.id)}
            className={`text-xs px-3 py-1 rounded-lg ml-3 flex-shrink-0 ${
              n.approval_status === 'approved'
                ? 'bg-emerald-200 text-emerald-800 hover:bg-emerald-300'
                : 'bg-red-200 text-red-800 hover:bg-red-300'
            } transition`}
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}
