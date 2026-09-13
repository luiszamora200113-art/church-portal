import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

export default function AboutChurch() {
  const { token, API_URL } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/api/church-info`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, [token]);

  if (!data) return <p className="muted center">Cargando…</p>;
  const { info, leaders } = data;
  const hasContact = info.facebook || info.instagram || info.whatsapp || info.contact_phone || info.contact_email;

  return (
    <div className="dash-wrap">
      <div className="dash-header">
        <div>
          <h1>Conócenos</h1>
          <p className="subtitle">Iglesia Hechos 1:8</p>
        </div>
      </div>

      {(info.vision || info.mission) && (
        <div className="card">
          {info.mission && (
            <>
              <h2>Misión</h2>
              <p style={{ whiteSpace: 'pre-wrap' }}>{info.mission}</p>
            </>
          )}
          {info.vision && (
            <>
              <h2 style={{ marginTop: info.mission ? 18 : 0 }}>Visión</h2>
              <p style={{ whiteSpace: 'pre-wrap' }}>{info.vision}</p>
            </>
          )}
        </div>
      )}

      {leaders.length > 0 && (
        <div className="card">
          <h2>Nuestros líderes</h2>
          <div className="grid" style={{ marginTop: 12 }}>
            {leaders.map((l) => (
              <div key={l.id} className="mini-card" style={{ textAlign: 'center' }}>
                {l.photo_data ? (
                  <img
                    src={l.photo_data}
                    alt={l.full_name}
                    style={{ width: 84, height: 84, borderRadius: '50%', objectFit: 'cover', margin: '0 auto 10px' }}
                  />
                ) : (
                  <div style={{ width: 84, height: 84, borderRadius: '50%', background: 'var(--moss)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700, margin: '0 auto 10px' }}>
                    {l.full_name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
                  </div>
                )}
                <h3 style={{ marginBottom: 2 }}>{l.full_name}</h3>
                <p className="muted" style={{ fontSize: 13 }}>{l.role_title}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {(info.address || info.schedule_info) && (
        <div className="card">
          <h2>Horarios y dirección</h2>
          {info.schedule_info && <p style={{ whiteSpace: 'pre-wrap' }}>{info.schedule_info}</p>}
          {info.address && <p className="muted" style={{ marginTop: info.schedule_info ? 8 : 0 }}>📍 {info.address}</p>}
        </div>
      )}

      {hasContact && (
        <div className="card">
          <h2>Contacto</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {info.whatsapp && (
              <li>
                <a href={`https://wa.me/${info.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">💬 WhatsApp: {info.whatsapp}</a>
              </li>
            )}
            {info.contact_phone && <li>📞 {info.contact_phone}</li>}
            {info.contact_email && <li>✉️ {info.contact_email}</li>}
            {info.facebook && (
              <li><a href={info.facebook} target="_blank" rel="noopener noreferrer">📘 Facebook</a></li>
            )}
            {info.instagram && (
              <li><a href={info.instagram} target="_blank" rel="noopener noreferrer">📷 Instagram</a></li>
            )}
          </ul>
        </div>
      )}

      {!info.vision && !info.mission && leaders.length === 0 && !info.address && !hasContact && (
        <div className="card"><p className="muted">Esta información aún no ha sido cargada por un administrador.</p></div>
      )}
    </div>
  );
}
