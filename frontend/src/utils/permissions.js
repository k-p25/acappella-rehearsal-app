export function canManageRehearsals(user) {
  return user?.role === 'music_director';
}

export function canApproveAttendance(user) {
  return user?.role === 'music_director';
}

export function canViewAbsenceReasons(user) {
  return user?.role === 'music_director' || user?.role === 'president';
}

export function canManageGigs(user) {
  return ['music_director', 'president', 'business_manager'].includes(user?.role);
}

export function canViewDeclineReasons(user) {
  return ['music_director', 'president'].includes(user?.role);
}
