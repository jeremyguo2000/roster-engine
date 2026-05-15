import { NavLink } from "react-router-dom";

export default function Nav() {
  return (
    <nav className="nav">
      <NavLink to="/rosters" className="nav-brand">
        Roster<em>Engine</em>
      </NavLink>
      <div className="nav-links">
        <NavTab to="/shifts" label="Shifts" />
        <NavTab to="/staff" label="Staff" />
        <NavTab to="/profiles" label="Profiles" />
        <NavTab to="/generate" label="Generate" />
        <NavTab to="/rosters" label="Rosters" />
      </div>
      <div className="nav-right" />
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
