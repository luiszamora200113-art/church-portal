import React from 'react';
import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import MyCell from './pages/MyCell.jsx';
import Finance from './pages/Finance.jsx';
import Privileges from './pages/Privileges.jsx';
import AdminLayout from './pages/admin/AdminLayout.jsx';
import CreateMember from './pages/admin/CreateMember.jsx';
import AdminCells from './pages/admin/AdminCells.jsx';
import AdminTemplates from './pages/admin/AdminTemplates.jsx';
import AdminChurchInfo from './pages/admin/AdminChurchInfo.jsx';
import AdminServices from './pages/admin/AdminServices.jsx';
import AdminMinistries from './pages/admin/AdminMinistries.jsx';
import AdminHistorial from './pages/admin/AdminHistorial.jsx';
import AboutChurch from './pages/AboutChurch.jsx';
import AdminFinance from './pages/admin/AdminFinance.jsx';
import AdminDuties from './pages/admin/AdminDuties.jsx';
import AdminDocuments from './pages/admin/AdminDocuments.jsx';
import AdminReports from './pages/admin/AdminReports.jsx';
import ForcePasswordChange from './pages/ForcePasswordChange.jsx';
import TreasuryPanel from './pages/TreasuryPanel.jsx';
import SecretaryPanel from './pages/SecretaryPanel.jsx';
import EducationPanel from './pages/EducationPanel.jsx';
import Documents from './pages/Documents.jsx';
import Events from './pages/Events.jsx';
import MonthlySchedule from './pages/MonthlySchedule.jsx';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="muted center">Cargando…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.must_change_password) return <Navigate to="/cambiar-clave" replace />;
  return children;
}

function homePathForRole() {
  return '/dashboard';
}

// Para /cambiar-clave: exige sesión iniciada, pero NO redirige por must_change_password
// (evitaría un ciclo infinito). Una vez resuelto, saca de esta pantalla hacia su panel correspondiente.
function RequireAuthOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="muted center">Cargando…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.must_change_password) return <Navigate to={homePathForRole(user.role)} replace />;
  return children;
}

function Nav() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = React.useState(false);

  React.useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  if (!user) return null;
  // El nav del miembro no se muestra dentro de los paneles con su propio layout (admin, tesorería, secretaría).
  if (location.pathname.startsWith('/admin')) return null;
  if (location.pathname.startsWith('/tesoreria')) return null;
  if (location.pathname.startsWith('/secretaria')) return null;
  if (location.pathname.startsWith('/educacion')) return null;

  const linkClass = (path) => (location.pathname === path ? 'active' : '');

  return (
    <div className="topnav">
      <div className="brand">
        <img className="brand-logo" src="/assets/logo-claro.png" alt="Logo Iglesia Hechos 1:8" />
        Hechos 1:8
      </div>
      <button
        className="nav-toggle"
        aria-label="Abrir menú"
        onClick={() => setMenuOpen((o) => !o)}
      >
        {menuOpen ? '✕' : '☰'}
      </button>
      <nav className={menuOpen ? 'open' : ''}>
        <Link className={linkClass('/dashboard')} to="/dashboard">Inicio</Link>
        <Link className={linkClass('/conocenos')} to="/conocenos">Conócenos</Link>
        <Link className={linkClass('/deberes')} to="/deberes">Mis privilegios</Link>
        <Link className={linkClass('/mi-celula')} to="/mi-celula">Mi célula</Link>
        {(['admin', 'superadmin', 'finance'].includes(user.role) || user.can_view_finance) && (
          <Link className={linkClass('/finanzas')} to="/finanzas">Finanzas</Link>
        )}
        <Link className={linkClass('/eventos')} to="/eventos">Eventos</Link>
        <Link className={linkClass('/programacion')} to="/programacion">Programación</Link>
        {['admin', 'superadmin', 'secretary'].includes(user.role) && (
          <Link className={linkClass('/documentos')} to="/documentos">Documentos</Link>
        )}
        {['admin', 'superadmin'].includes(user.role) && (
          <Link to="/admin/miembros">Panel de administración</Link>
        )}
        {user.role === 'finance' && <Link className={linkClass('/tesoreria')} to="/tesoreria">Tesorería</Link>}
        {user.role === 'secretary' && <Link className={linkClass('/secretaria')} to="/secretaria">Secretaría</Link>}
        {user.role === 'education' && <Link className={linkClass('/educacion')} to="/educacion">Educación Cristiana</Link>}
        <a href="#" className="nav-logout" onClick={(e) => { e.preventDefault(); logout(); }}>Cerrar sesión</a>
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Nav />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/cambiar-clave"
          element={
            <RequireAuthOnly>
              <ForcePasswordChange />
            </RequireAuthOnly>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/deberes"
          element={
            <ProtectedRoute>
              <Privileges />
            </ProtectedRoute>
          }
        />
        <Route
          path="/mi-celula"
          element={
            <ProtectedRoute>
              <MyCell />
            </ProtectedRoute>
          }
        />
        <Route
          path="/finanzas"
          element={
            <ProtectedRoute>
              <Finance />
            </ProtectedRoute>
          }
        />
        <Route
          path="/documentos"
          element={
            <ProtectedRoute>
              <Documents />
            </ProtectedRoute>
          }
        />
        <Route
          path="/conocenos"
          element={
            <ProtectedRoute>
              <AboutChurch />
            </ProtectedRoute>
          }
        />
        <Route
          path="/eventos"
          element={
            <ProtectedRoute>
              <Events />
            </ProtectedRoute>
          }
        />
        <Route
          path="/programacion"
          element={
            <ProtectedRoute>
              <MonthlySchedule />
            </ProtectedRoute>
          }
        />
        <Route path="/tesoreria" element={<TreasuryPanel />} />
        <Route path="/secretaria" element={<SecretaryPanel />} />
        <Route path="/educacion" element={<EducationPanel />} />

        {/* Panel de administración: layout propio con sidebar, rutas anidadas */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin/miembros" replace />} />
          <Route path="miembros" element={<CreateMember />} />
          <Route path="celulas" element={<AdminCells />} />
          <Route path="plantillas" element={<AdminTemplates />} />
          <Route path="conocenos" element={<AdminChurchInfo />} />
          <Route path="servicios" element={<AdminServices />} />
          <Route path="ministerios" element={<AdminMinistries />} />
          <Route path="historial" element={<AdminHistorial />} />
          <Route path="finanzas" element={<AdminFinance />} />
          <Route path="deberes" element={<AdminDuties />} />
          <Route path="documentos" element={<AdminDocuments />} />
          <Route path="reportes" element={<AdminReports />} />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  );
}