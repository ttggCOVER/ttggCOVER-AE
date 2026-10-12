import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LayoutDashboard, PlusCircle, CalendarClock, ListTodo, LogOut, GraduationCap } from 'lucide-react';

const adminNav = [
  { to: '/dashboard', label: '工作台', icon: LayoutDashboard },
  { to: '/consultations/new', label: '登记咨询', icon: PlusCircle },
  { to: '/trials/schedule', label: '安排试听', icon: CalendarClock },
  { to: '/follow-ups', label: '跟进工作台', icon: ListTodo },
];

const teacherNav = [
  { to: '/dashboard', label: '今日课表', icon: LayoutDashboard },
];

export function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const items = user?.role === 'admin' ? adminNav : teacherNav;

  function onLogout() {
    logout();
    nav('/login');
  }

  return (
    <div className="flex h-screen bg-[#f5f6f8]">
      <aside className="w-60 shrink-0 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2 text-ink">
            <GraduationCap className="w-5 h-5 text-brand" />
            <span className="font-semibold">学生管理</span>
          </div>
          <div className="text-xs text-ink-soft mt-1">Austin Education</div>
        </div>
        <nav className="flex-1 py-3">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-5 py-2.5 text-sm transition-colors ${
                  isActive ? 'bg-brand-soft text-brand-dark font-medium border-l-2 border-brand' : 'text-ink hover:bg-gray-50 border-l-2 border-transparent'
                }`
              }
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-5 py-3 border-t border-gray-200">
          <div className="text-xs text-ink-soft">
            {user?.name} · {user?.role === 'admin' ? '课程顾问' : '老师'}
          </div>
          <button
            onClick={onLogout}
            className="mt-2 flex items-center gap-2 text-sm text-ink-soft hover:text-bad transition-colors"
          >
            <LogOut className="w-4 h-4" /> 退出
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
