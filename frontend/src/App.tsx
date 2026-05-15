import { Routes, Route, Navigate } from "react-router-dom";

import RostersPage from "./pages/RostersPage";
import ShiftsPage from "./pages/ShiftsPage";
import StaffPage from "./pages/StaffPage";
import ProfilesPage from "./pages/ProfilesPage";
import GeneratePage from "./pages/GeneratePage";
import LoginPage from "./pages/LoginPage";
import Nav from "./components/Nav";

export default function App() {
  return (
    <div className="app-shell">
      <Nav />
      <main className="main">
        <Routes>
          <Route path="/" element={<Navigate to="/rosters" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/rosters" element={<RostersPage />} />
          <Route path="/shifts" element={<ShiftsPage />} />
          <Route path="/staff" element={<StaffPage />} />
          <Route path="/profiles" element={<ProfilesPage />} />
          <Route path="/generate" element={<GeneratePage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
}

function NotFound() {
  return (
    <div className="empty-state">
      <h2 className="section-title">Page not found</h2>
    </div>
  );
}
