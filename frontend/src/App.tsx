import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { setUnauthorizedHandler } from "@/api/client";
import { AppRoutes } from "./routes";

export default function App() {
  const navigate = useNavigate();

  useEffect(() => {
    setUnauthorizedHandler(() => navigate("/login", { replace: true }));
  }, [navigate]);

  return <AppRoutes />;
}
