import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { BarChart3, FlaskConical, LayoutGrid, LogOut, Sparkles, Users, Activity } from "lucide-react";
import { useAuth } from "../auth";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutGrid, end: true },
  { to: "/students", label: "Students", icon: Users },
  { to: "/predict", label: "Predict", icon: Sparkles },
  { to: "/insights", label: "Insights", icon: BarChart3 },
  { to: "/lab", label: "Model Lab", icon: FlaskConical },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const [health, setHealth] = useState(null);

  useEffect(() => { fetch("/api/health").then((r) => r.json()).then(setHealth).catch(() => {}); }, [loc.pathname]);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Activity size={18} strokeWidth={2.4} /></div>
          <div>
            <div className="brand-name">Cohort</div>
            <div className="brand-sub">PERFORMANCE INTELLIGENCE</div>
          </div>
        </div>
        <nav className="nav">
          <div className="nav-label">Workspace</div>
          {NAV.map(({ to, label, icon: Icon, end }, i) => (
            <NavLink key={to} to={to} end={end}>
              <Icon size={17} strokeWidth={1.8} /> {label}
              <span className="nav-idx">0{i + 1}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="model-chip">
            <div className="row" style={{ gap: 8, fontSize: 12 }}>
              <span className="pulse" /> <span style={{ color: "#fff" }}>Model {health?.model_loaded ? "online" : "…"}</span>
            </div>
            <div className="mono" style={{ fontSize: 10, color: "rgba(223,233,232,.45)", marginTop: 6 }}>
              {health?.trained_at ? `trained ${new Date(health.trained_at).toLocaleString()}` : "checking"}
            </div>
          </div>
          <div className="user-row">
            <div className="avatar">{user?.name?.[0]?.toUpperCase()}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user?.name}</div>
              <div className="mono" style={{ fontSize: 10, color: "rgba(223,233,232,.5)" }}>{user?.role}</div>
            </div>
            <button className="icon-btn" onClick={logout} title="Sign out"><LogOut size={16} /></button>
          </div>
        </div>
      </aside>
      <main className="main">
        <AnimatePresence mode="wait">
          <motion.div key={loc.pathname} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
