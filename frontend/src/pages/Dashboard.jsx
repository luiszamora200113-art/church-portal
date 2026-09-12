import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { verseOfTheDay } from '../data/verses.js';

export default function Dashboard() {
  const { user, token, logout, API_URL } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [iosDismissed, setIosDismissed] = useState(() => localStorage.getItem('ios_install_dismissed') === 'true');

  const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIOS = /iPhone|iPad|iPod/.test(window.navigator.userAgent) && !window.MSStream;
  const showIOSInstructions = isIOS && !isStandalone && !iosDismissed;

  useEffect(() => {
    function handlePrompt(e) {
      e.preventDefault();
      setInstallPrompt(e);
    }
    window.addEventListener('beforeinstallprompt', handlePrompt);
    return () => window.removeEventListener('beforeinstallprompt', handlePrompt);
  }, []);

  async function handleInstall() {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }
  const [titheConfirmed, setTitheConfirmed] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then(setNotifications)
      .catch(() => {});

    fetch(`${API_URL}/api/tithe/mine`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => setTitheConfirmed(d.confirmed))
      .catch(() => {});
  }, [token]);

  if (!user) return null;

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>Hola, {user.full_name.split(' ')[0]}</h1>
          <p className="subtitle">Bienvenido al portal</p>
        </div>
        <button className="secondary" onClick={logout}>Cerrar sesión</button>
      </header>

      <section className="verse-card">
        <span className="eyebrow">Versículo del día</span>
        <p className="verse-text">"{verseOfTheDay().text}"</p>
        <p className="verse-ref">{verseOfTheDay().ref}</p>
      </section>

      {installPrompt && (
        <section className="install-banner">
          <div>
            <strong>Instala el portal en tu celular</strong>
            <p>Ábrelo como una app, sin escribir la dirección cada vez.</p>
          </div>
          <button className="primary" style={{ marginTop: 0, width: 'auto', padding: '10px 18px' }} onClick={handleInstall}>
            Instalar
          </button>
        </section>
      )}

      {showIOSInstructions && (
        <section className="install-banner">
          <div>
            <strong>Instala el portal en tu iPhone</strong>
            <p>
              Toca el botón <strong>Compartir</strong> <span aria-hidden="true">⎋</span> abajo en Safari, y elige{' '}
              <strong>"Agregar a pantalla de inicio"</strong>.
            </p>
          </div>
          <button className="btn-outline" style={{ marginTop: 0, width: 'auto', padding: '10px 18px' }} onClick={() => { localStorage.setItem('ios_install_dismissed', 'true'); setIosDismissed(true); }}>
            Entendido
          </button>
        </section>
      )}

      <section className="card">
        <h2>Notificaciones</h2>
        {notifications.length === 0 && <p className="muted">No tienes notificaciones por ahora.</p>}
        <ul className="notif-list">
          {notifications.map((n) => (
            <li key={n.id} className={n.is_read ? 'read' : 'unread'}>
              <strong>{n.title}</strong>
              <p>{n.message}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid">
        <Link to="/mis-privilegios" className="mini-card" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span className="eyebrow">Mis privilegios</span>
          <h3>Recordatorios y diezmo</h3>
          <p>{titheConfirmed === null ? 'Ver mis privilegios' : titheConfirmed ? 'Diezmo confirmado ✓' : 'Diezmo pendiente este mes'}</p>
        </Link>
        <Link to="/mi-celula" className="mini-card" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span className="eyebrow">Comunidad</span>
          <h3>Mi célula</h3>
          <p>Consulta o cambia tu célula.</p>
        </Link>
        <Link to="/finanzas" className="mini-card" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span className="eyebrow">Transparencia</span>
          <h3>Finanzas de la iglesia</h3>
          <p>Consulta los totales del mes (solo lectura).</p>
        </Link>
      </section>
    </div>
  );
}