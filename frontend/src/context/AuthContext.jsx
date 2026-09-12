import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

// URL del backend. Si no se define VITE_API_URL, usa el mismo origen (backend y frontend juntos en un solo servicio).
const API_URL = import.meta.env.VITE_API_URL || '';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('portal_token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    fetch(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => setUser(data))
      .catch(() => {
        localStorage.removeItem('portal_token');
        setToken(null);
      })
      .finally(() => setLoading(false));
  }, [token]);

  async function login(username, password) {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo iniciar sesión.');

    localStorage.setItem('portal_token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }

  function logout() {
    localStorage.removeItem('portal_token');
    setToken(null);
    setUser(null);
  }

  function markPasswordChanged() {
    setUser((u) => (u ? { ...u, must_change_password: false } : u));
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading, API_URL, markPasswordChanged }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
