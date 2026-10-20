const BASE = import.meta.env.VITE_API_URL ?? "";
const TOKEN_KEY = "cohort.token";

export const tokenStore = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t) => { try { localStorage.setItem(TOKEN_KEY, t); } catch {} },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY); } catch {} },
};

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function request(path, { method = "GET", body, form } = {}) {
  const headers = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method, headers, body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  if (res.status === 401 && token) {
    tokenStore.clear();
    window.dispatchEvent(new Event("cohort:logout"));
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = Array.isArray(data.detail) ? data.detail.map((d) => d.msg).join(", ") : data.detail;
    throw new ApiError(res.status, detail || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  login: (email, password) => request("/api/auth/login", { method: "POST", body: { email, password } }),
  register: (name, email, password) => request("/api/auth/register", { method: "POST", body: { name, email, password } }),
  me: () => request("/api/auth/me"),

  overview: () => request("/api/analytics/overview"),
  schema: () => request("/api/model/schema"),
  report: () => request("/api/model/report"),
  status: () => request("/api/model/status"),
  runs: () => request("/api/model/runs"),
  retrain: () => request("/api/model/retrain", { method: "POST" }),

  students: (params) => request(`/api/students?${new URLSearchParams(params)}`),
  student: (id) => request(`/api/students/${id}`),
  createStudent: (body) => request("/api/students", { method: "POST", body }),
  updateStudent: (id, body) => request(`/api/students/${id}`, { method: "PATCH", body }),
  deleteStudent: (id) => request(`/api/students/${id}`, { method: "DELETE" }),
  uploadStudents: (file) => { const f = new FormData(); f.append("file", file); return request("/api/students/upload", { method: "POST", form: f }); },

  predict: (features, opts = {}) => request("/api/predict", { method: "POST", body: { features, ...opts } }),
  simulate: (features) => request("/api/predict/simulate", { method: "POST", body: { features, save: false } }),
  history: () => request("/api/predict/history"),
};
