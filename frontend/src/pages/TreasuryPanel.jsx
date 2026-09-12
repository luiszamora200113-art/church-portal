import React from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import AdminFinance from './admin/AdminFinance.jsx';

async function downloadPdf(path, filename, token, API_URL) {
  const res = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function TreasuryPanel() {
  const { user, loading, token, API_URL } = useAuth();
  if (loading) return <p className="muted center">Cargando…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (!['finance', 'admin', 'superadmin'].includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-brand">
          <img className="brand-logo" src="/assets/logo-claro.png" alt="Logo" />
          <span>Tesorería</span>
        </div>
        <nav className="admin-nav">
          <span className="active">Finanzas</span>
        </nav>
        <Link className="admin-back" to="/dashboard">← Volver al portal</Link>
      </aside>
      <main className="admin-content">
        <AdminFinance />
        <div className="card">
          <h2>Descargar en PDF</h2>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn-outline" onClick={() => downloadPdf('/api/reports/finanzas.pdf', 'reporte-finanzas.pdf', token, API_URL)}>
              Finanzas del mes
            </button>
            <button className="btn-outline" onClick={() => downloadPdf('/api/reports/diezmos.pdf', 'reporte-diezmos.pdf', token, API_URL)}>
              Estado de diezmo
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
