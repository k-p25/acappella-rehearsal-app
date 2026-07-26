export const ROLES = [
  { value: 'president', label: 'President' },
  { value: 'music_director', label: 'Music Director' },
  { value: 'business_manager', label: 'Business Manager' },
  { value: 'social_chair', label: 'Social Chair' },
  { value: 'member', label: 'Member' },
];

export function roleLabel(role) {
  return ROLES.find((r) => r.value === role)?.label || role;
}
