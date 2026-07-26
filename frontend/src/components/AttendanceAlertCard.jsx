import { Link } from 'react-router-dom';

export default function AttendanceAlertCard({ pendingCount }) {
  return (
    <div className="bg-white rounded-lg border border-indigo-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-indigo-800">📋 Absences Pending</h2>
      </div>

      {pendingCount === 0 ? (
        <p className="text-sm text-slate-400">No absence requests pending.</p>
      ) : (
        <div>
          <Link to="/rehearsals" className="block mb-3">
            <p className="text-sm font-medium text-slate-900">
              You have {pendingCount} absence {pendingCount === 1 ? 'request' : 'requests'} awaiting review
            </p>
            <p className="text-xs text-slate-500 mt-0.5">View the full queue →</p>
          </Link>
        </div>
      )}
    </div>
  );
}
