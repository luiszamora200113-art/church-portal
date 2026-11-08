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
import Biblioteca from './pages/Biblioteca.jsx';
import BibliotecaEducacion from './pages/BibliotecaEducacion.jsx';
import AdminBiblioteca from './pages/admin/AdminBiblioteca.jsx';

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

const NAV_CSS = `
/* Navegación superior: grupo "Gestión" (desplegable). Va aquí dentro para que App.jsx sea autosuficiente. */
.topnav .brand { white-space: nowrap; flex-shrink: 0; }
.topnav nav a { white-space: nowrap; }
.nav-group { position: relative; }
.nav-group-toggle {
  background: none; border: none; padding: 0; margin: 0; cursor: pointer;
  color: #cfd8cf; font-size: 13px; font-family: inherit; line-height: inherit; white-space: nowrap;
  display: flex; align-items: center; gap: 5px;
}
.nav-group-toggle:hover { color: #fff; }
.nav-group-toggle.active { color: #fff; font-weight: 600; border-bottom: 2px solid var(--gold); padding-bottom: 4px; }
.nav-caret { font-size: 10px; transition: transform .15s ease; }
.nav-group-toggle.open .nav-caret { transform: rotate(180deg); }
.nav-group-menu {
  display: none; position: absolute; right: 0; top: calc(100% + 14px); min-width: 240px;
  flex-direction: column; background: var(--moss-dark);
  border: 1px solid rgba(255,255,255,.12); border-radius: 12px; padding: 6px;
  box-shadow: 0 12px 28px rgba(0,0,0,.3); z-index: 50;
}
.nav-group-menu.open { display: flex; }
.topnav nav .nav-group-menu a { display: block; padding: 10px 14px; border-radius: 8px; border-bottom: none; }
.topnav nav .nav-group-menu a:hover { background: rgba(255,255,255,.08); }
.topnav nav .nav-group-menu a.active { background: rgba(255,255,255,.12); border-bottom: none; padding-bottom: 10px; }

@media (min-width: 721px) and (max-width: 1050px) {
  .topnav { padding-left: 16px; padding-right: 16px; }
  .topnav nav { gap: 14px; font-size: 12.5px; }
  .nav-group-toggle { font-size: 12.5px; }
}

@media (max-width: 720px) {
  .nav-group { width: 100%; }
  .nav-group-toggle, .nav-group-toggle.active {
    width: 100%; padding: 16px 24px 6px; border-bottom: none;
    color: var(--gold-soft); font-size: 11px; font-weight: 700;
    text-transform: uppercase; letter-spacing: .06em; pointer-events: none;
  }
  .nav-caret { display: none; }
  .nav-group-menu { display: flex; position: static; min-width: 0; background: transparent; border: none; border-radius: 0; box-shadow: none; padding: 0; }
  .topnav nav .nav-group-menu a { padding: 14px 24px 14px 36px; border-radius: 0; border-bottom: 1px solid rgba(255,255,255,0.08); }
  .topnav nav .nav-group-menu a.active { padding-bottom: 14px; }
}
`;

function Nav() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = React.useState(false);

  const [groupOpen, setGroupOpen] = React.useState(false);
  const groupRef = React.useRef(null);

  React.useEffect(() => { setMenuOpen(false); setGroupOpen(false); }, [location.pathname]);

  // Cierra el desplegable "Gestión" al tocar fuera de él.
  React.useEffect(() => {
    if (!groupOpen) return undefined;
    const onDown = (e) => {
      if (groupRef.current && !groupRef.current.contains(e.target)) setGroupOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [groupOpen]);

  if (!user) return null;
  // El nav del miembro no se muestra dentro de los paneles con su propio layout (admin, tesorería, secretaría).
  if (location.pathname.startsWith('/admin')) return null;
  if (location.pathname.startsWith('/tesoreria')) return null;
  if (location.pathname.startsWith('/secretaria')) return null;
  if (location.pathname.startsWith('/educacion')) return null;

  const linkClass = (path) => (location.pathname === path ? 'active' : '');

  // Enlaces de trabajo según el rol: se agrupan en el desplegable "Gestión" para no saturar la barra.
  const staffItems = [];
  if (['admin', 'superadmin', 'secretary'].includes(user.role)) staffItems.push({ to: '/documentos', label: 'Documentos' });
  if (['admin', 'superadmin'].includes(user.role)) staffItems.push({ to: '/admin/miembros', label: 'Panel de administración', match: '/admin' });
  if (['finance', 'admin', 'superadmin'].includes(user.role)) staffItems.push({ to: '/tesoreria', label: 'Tesorería' });
  if (['secretary', 'admin', 'superadmin'].includes(user.role)) staffItems.push({ to: '/secretaria', label: 'Secretaría' });
  if (['education', 'admin', 'superadmin'].includes(user.role)) staffItems.push({ to: '/educacion', label: 'Educación Cristiana' });
  const isStaffActive = (item) => location.pathname.startsWith(item.match || item.to);

  return (
    <div className="topnav">
      <style>{NAV_CSS}</style>
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
        <Link className={linkClass('/biblioteca')} to="/biblioteca">Biblioteca</Link>
        {staffItems.length === 1 && (
          <Link className={isStaffActive(staffItems[0]) ? 'active' : ''} to={staffItems[0].to}>{staffItems[0].label}</Link>
        )}
        {staffItems.length > 1 && (
          <div className="nav-group" ref={groupRef}>
            <button
              type="button"
              className={`nav-group-toggle ${staffItems.some(isStaffActive) ? 'active' : ''} ${groupOpen ? 'open' : ''}`}
              aria-expanded={groupOpen}
              onClick={() => setGroupOpen((o) => !o)}
            >
              Gestión <span className="nav-caret">▾</span>
            </button>
            <div className={`nav-group-menu ${groupOpen ? 'open' : ''}`}>
              {staffItems.map((item) => (
                <Link key={item.to} className={isStaffActive(item) ? 'active' : ''} to={item.to}>{item.label}</Link>
              ))}
            </div>
          </div>
        )}
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
        <Route
          path="/biblioteca"
          element={
            <ProtectedRoute>
              <Biblioteca />
            </ProtectedRoute>
          }
        />
        <Route
          path="/educacion/biblioteca"
          element={
            <ProtectedRoute>
              <BibliotecaEducacion />
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
          <Route path="biblioteca" element={<AdminBiblioteca />} />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  );
}