import { NavLink } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { useRunningRosters } from "../hooks/useRunningRosters";

export default function Nav() {
  const { user, logout } = useAuth();
  const { data: running = [] } = useRunningRosters();

  return (
    <nav className="nav">
      <NavLink to="/rosters" className="nav-brand">
        Roster<em>Engine</em>
      </NavLink>
      {user && (
        <div className="nav-links">
          <NavTab to="/shifts" label="Shifts" />
          <NavTab to="/staff" label="Staff" />
          <NavTab to="/profiles" label="Profiles" />
          <NavTab to="/generate" label="Generate" />
          <NavTab to="/rosters" label="Rosters" />
        </div>
      )}
      <div className="nav-right">
        {user && running.length > 0 && (
          <div className="nav-job-status" title={running.map((r) => r.name).join(", ")}>
            <div className="nav-spinner" />
            <span>Solving…</span>
          </div>
        )}
        {user && (
          <>
            <span className="nav-user">{user.username}</span>
            <button className="btn btn-sm" onClick={logout}>Sign out</button>
          </>
        )}
      </div>
    </nav>
  );
}

function NavTab({ to, label }: { to: string; label: string }) {
  return (
    <NavLink to={to} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
      {label}
    </NavLink>
  );
}
