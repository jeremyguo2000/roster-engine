import { FormEvent, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { errorMessage } from "../api/client";

interface LocationState {
  from?: string;
}

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return <div className="empty-state">Loading…</div>;
  if (user) {
    const from = (location.state as LocationState | null)?.from ?? "/rosters";
    return <Navigate to={from} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
      const from = (location.state as LocationState | null)?.from ?? "/rosters";
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err, "Login failed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 380, margin: "48px auto" }}>
      <div className="page-header" style={{ borderBottom: "none", marginBottom: 24 }}>
        <div>
          <h1 className="page-title" style={{ fontSize: 28 }}>Sign in</h1>
          <p className="page-sub">Access the roster engine.</p>
        </div>
      </div>
      <div className="card">
        <form onSubmit={onSubmit} className="stack">
          <div className="field">
            <label className="label" htmlFor="username">Username</label>
            <input
              id="username"
              className="input"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="input"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <div className="field-error" role="alert">{error}</div>}
          <button type="submit" className="btn btn-primary btn-full" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
