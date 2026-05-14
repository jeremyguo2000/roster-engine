import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute } from "@/features/auth/ProtectedRoute";
import { LoginPage } from "@/features/auth/LoginPage";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { RostersListPage } from "@/features/rosters/RostersListPage";
import { RosterDetailPage } from "@/features/rosters/RosterDetailPage";
import { GenerateRosterPage } from "@/features/rosters/GenerateRosterPage";
import { StaffListPage } from "@/features/staff/StaffListPage";
import { StaffDetailPage } from "@/features/staff/StaffDetailPage";
import { StaffGroupsPage } from "@/features/staff/StaffGroupsPage";
import { ProfilesListPage } from "@/features/profiles/ProfilesListPage";
import { ProfileDetailPage } from "@/features/profiles/ProfileDetailPage";
import { ShiftsPage } from "@/features/shifts/ShiftsPage";
import { SkillsPage } from "@/features/skills/SkillsPage";
import { DemandsPage } from "@/features/demands/DemandsPage";
import { UsersPage } from "@/features/users/UsersPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/rosters" element={<RostersListPage />} />
          <Route path="/rosters/new" element={<GenerateRosterPage />} />
          <Route path="/rosters/:id" element={<RosterDetailPage />} />
          <Route path="/staff" element={<StaffListPage />} />
          <Route path="/staff/groups" element={<StaffGroupsPage />} />
          <Route path="/staff/:id" element={<StaffDetailPage />} />
          <Route path="/profiles" element={<ProfilesListPage />} />
          <Route path="/profiles/:id" element={<ProfileDetailPage />} />
          <Route path="/shifts" element={<ShiftsPage />} />
          <Route path="/skills" element={<SkillsPage />} />
          <Route path="/demands" element={<DemandsPage />} />
          <Route path="/users" element={<UsersPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
