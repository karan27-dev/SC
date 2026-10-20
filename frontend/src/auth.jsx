import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, tokenStore } from "./api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!tokenStore.get()) { setReady(true); return; }
    api.me().then(setUser).catch(() => tokenStore.clear()).finally(() => setReady(true));
  }, []);

  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener("cohort:logout", onLogout);
    return () => window.removeEventListener("cohort:logout", onLogout);
  }, []);

  const accept = (res) => { tokenStore.set(res.access_token); setUser(res.user); return res.user; };
  const login = useCallback((e, p) => api.login(e, p).then(accept), []);
  const register = useCallback((n, e, p) => api.register(n, e, p).then(accept), []);
  const logout = useCallback(() => { tokenStore.clear(); setUser(null); }, []);

  return <AuthCtx.Provider value={{ user, ready, login, register, logout }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
