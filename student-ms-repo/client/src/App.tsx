import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { AdminDashboard } from './pages/AdminDashboard';
import { TeacherDashboard } from './pages/TeacherDashboard';
import { NewConsultation } from './pages/NewConsultation';
import { ScheduleTrial } from './pages/ScheduleTrial';
import { StudentDetail } from './pages/StudentDetail';
import { FollowUps } from './pages/FollowUps';
import { TrialFeedback } from './pages/TrialFeedback';
import { FunnelDetail } from './pages/FunnelDetail';
import { ClassAttendance } from './pages/ClassAttendance';

function RequireAuth({ children }: { children: JSX.Element }) {
  const { token } = useAuth();
  const loc = useLocation();
  if (!token) {
    const from = encodeURIComponent(loc.pathname + loc.search);
    return <Navigate to={`/login?from=${from}`} replace />;
  }
  return children;
}

// 按角色渲染 dashboard
function DashboardByRole() {
  const { user } = useAuth();
  return user?.role === 'admin' ? <AdminDashboard /> : <TeacherDashboard />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardByRole />} />
          <Route path="consultations/new" element={<NewConsultation />} />
          <Route path="trials/schedule" element={<ScheduleTrial />} />
          <Route path="trials/:id/feedback" element={<TrialFeedback />} />
          <Route path="follow-ups" element={<FollowUps />} />
          <Route path="funnel/:status" element={<FunnelDetail />} />
          <Route path="students/:id" element={<StudentDetail />} />
          <Route path="classes/:id/attendance" element={<ClassAttendance />} />
          <Route path="*" element={<div className="p-8 text-center text-ink-soft">404 · 页面不存在</div>} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
