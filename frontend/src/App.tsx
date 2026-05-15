import { Routes, Route, Navigate } from "react-router-dom";

import RostersPage from "./pages/RostersPage";
import ShiftsPage from "./pages/ShiftsPage";
import StaffPage from "./pages/StaffPage";
import ProfilesPage from "./pages/ProfilesPage";
import GeneratePage from "./pages/GeneratePage";
import LoginPage from "./pages/LoginPage";
import Nav from "./components/Nav";
import { AuthProvider } from "./auth/AuthContext";
import RequireAuth from "./auth/RequireAuth";

export default function App() {
  return (
    <AuthProvider>
      <div className="app-shell">
        <Nav />
        <main className="main">
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<Navigate to="/rosters" replace />} />
            <Route path="/rosters" element={<RequireAuth><RostersPage /></RequireAuth>} />
            <Route path="/shifts" element={<RequireAuth><ShiftsPage /></RequireAuth>} />
            <Route path="/staff" element={<RequireAuth><StaffPage /></RequireAuth>} />
            <Route path="/profiles" element={<RequireAuth><ProfilesPage /></RequireAuth>} />
            <Route path="/generate" element={<RequireAuth><GeneratePage /></RequireAuth>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>
    </AuthProvider>
  );
}

function NotFound() {
  return (
    <div className="empty-state">
      <h2 className="section-title">Page not found</h2>
    </div>
  );
}
