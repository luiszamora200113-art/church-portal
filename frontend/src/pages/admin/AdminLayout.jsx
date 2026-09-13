import React, { useEffect, useState } from 'react';
import { Outlet, Link, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

export default function AdminLayout() {
  const { user, loading, token, API_URL } = useAuth();
  const location = useLocation();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/api/schedules/pending/list`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((list) => setPendingCount(Array.isArray(list) ? list.length : 0))
      .catch(() => {});
  }, [token, location.pathname]);

  if (loading) return <p className="muted center">Cargando…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (!['admin', 'superadmin'].includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  const linkClass = (path) => (location.pathname === path ? 'active' : '');

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-brand">
          <img className="brand-logo" src="/assets/logo-claro.png" alt="Logo" />
          <span>Panel admin</span>
        </div>
        <nav className="admin-nav">
          <Link className={linkClass('/admin/miembros')} to="/admin/miembros">Miembros</Link>
          <Link className={linkClass('/admin/celulas')} to="/admin/celulas">Células</Link>
          <Link className={linkClass('/admin/servicios')} to="/admin/servicios">Servicios</Link>
          {user.role === 'superadmin' && (
            <Link className={linkClass('/admin/plantillas')} to="/admin/plantillas">Plantillas</Link>
          )}
          {user.role === 'superadmin' && (
            <Link className={linkClass('/admin/conocenos')} to="/admin/conocenos">Conócenos</Link>
          )}
          <Link className={linkClass('/admin/finanzas')} to="/admin/finanzas">Finanzas</Link>
          <Link className={linkClass('/admin/documentos')} to="/admin/documentos" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Aprobaciones
            {pendingCount > 0 && (
              <span style={{
                background: 'var(--gold)', color: '#2b2109', fontSize: 11, fontWeight: 700,
                borderRadius: 999, padding: '1px 7px', lineHeight: '16px',
              }}>
                {pendingCount}
              </span>
            )}
          </Link>
          <Link className={linkClass('/admin/deberes')} to="/admin/deberes">Deberes</Link>
          <Link className={linkClass('/admin/reportes')} to="/admin/reportes">Reportes</Link>
        </nav>
        <Link className="admin-back" to="/dashboard">← Volver al portal</Link>
      </aside>
      <main className="admin-content">
        <Outlet />
      </main>
    </div>
  );
}
