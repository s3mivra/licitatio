import { NavLink, Outlet } from 'react-router-dom';
import { useOrg } from '../../lib/queries';
import { PageHeader, cx } from '../../ui';

const TABS = [
  { to: 'profile', label: 'Company profile' },
  { to: 'members', label: 'Members' },
  { to: 'staff-access', label: 'Staff access', ownerOnly: true },
  { to: 'notifications', label: 'Notifications' },
  { to: 'plan', label: 'Plan' },
  { to: 'audit', label: 'Audit log', adminOnly: true },
];

export function SettingsLayout() {
  const org = useOrg();
  const access = org.data?.access;
  const visible = TABS.filter((t) => {
    if (!access) return !t.ownerOnly && !t.adminOnly;
    const member = access.via === 'membership';
    if (t.ownerOnly) return member && access.role === 'owner';
    if (t.adminOnly) return member && (access.role === 'owner' || access.role === 'admin');
    return true;
  });
  return (
    <>
      <PageHeader title="Settings" />
      <nav className="-mx-4 mb-6 overflow-x-auto border-b border-slate-200 px-4" aria-label="Settings">
        <ul className="flex gap-1">
          {visible.map((t) => (
            <li key={t.to}>
              <NavLink to={t.to} className={({ isActive }) => cx('block whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium', isActive ? 'border-brand-700 text-brand-800' : 'border-transparent text-slate-600 hover:text-slate-900')}>{t.label}</NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="max-w-4xl"><Outlet /></div>
    </>
  );
}
