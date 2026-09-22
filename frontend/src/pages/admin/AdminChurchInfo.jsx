import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';

function fileToBase64(file) {
  // Redimensiona a máximo 400px y comprime, para que una foto tomada con la cámara del celular
  // (que puede pesar varios MB) no falle al guardarse.
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxSize = 400;
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function AdminChurchInfo() {
  const { user, token, API_URL } = useAuth();
  const [info, setInfo] = useState(null);
  const [leaders, setLeaders] = useState([]);
  const [msg, setMsg] = useState('');

  const [newLeader, setNewLeader] = useState({ full_name: '', role_title: '', photo_data: '' });
  const [leaderMsg, setLeaderMsg] = useState('');

  function load() {
    fetch(`${API_URL}/api/church-info`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => { setInfo(d.info); setLeaders(d.leaders); })
      .catch(() => {});
  }

  useEffect(() => { load(); }, [token]);

  async function saveInfo(e) {
    e.preventDefault();
    setMsg('Guardando…');
    const res = await fetch(`${API_URL}/api/church-info`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(info),
    });
    if (res.ok) setMsg('Guardado.'); else setMsg('No se pudo guardar.');
  }

  async function handlePhotoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    const base64 = await fileToBase64(file);
    setNewLeader((l) => ({ ...l, photo_data: base64 }));
  }

  async function addLeader(e) {
    e.preventDefault();
    if (!newLeader.full_name.trim() || !newLeader.role_title.trim()) {
      setLeaderMsg('Nombre y cargo son requeridos.');
      return;
    }
    setLeaderMsg('Guardando…');
    const res = await fetch(`${API_URL}/api/church-info/leaders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...newLeader, order_index: leaders.length }),
    });
    if (res.ok) {
      setNewLeader({ full_name: '', role_title: '', photo_data: '' });
      setLeaderMsg('');
      load();
    } else {
      setLeaderMsg('No se pudo agregar.');
    }
  }

  async function removeLeader(id) {
    if (!window.confirm('¿Quitar a este líder de "Conócenos"?')) return;
    await fetch(`${API_URL}/api/church-info/leaders/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    load();
  }

  if (user?.role !== 'superadmin') {
    return <p className="muted">Solo el superadmin puede editar esta información.</p>;
  }
  if (!info) return <p className="muted center">Cargando…</p>;

  return (
    <div>
      <h1>Conócenos</h1>
      <p className="subtitle" style={{ marginBottom: 20 }}>
        Esta información la ve cualquier miembro desde el menú. Solo tú puedes editarla.
      </p>

      <form className="card" onSubmit={saveInfo}>
        <h2>Misión y visión</h2>
        <label>Misión</label>
        <textarea rows={3} value={info.mission || ''} onChange={(e) => setInfo({ ...info, mission: e.target.value })} />
        <label>Visión</label>
        <textarea rows={3} value={info.vision || ''} onChange={(e) => setInfo({ ...info, vision: e.target.value })} />

        <h2 style={{ marginTop: 20 }}>Horarios y dirección</h2>
        <label>Horarios (puedes poner varias líneas)</label>
        <textarea rows={2} value={info.schedule_info || ''} onChange={(e) => setInfo({ ...info, schedule_info: e.target.value })} placeholder={'Domingos 10:00 AM y 5:00 PM\nJueves 6:00 PM (células)'} />
        <label>Dirección</label>
        <input value={info.address || ''} onChange={(e) => setInfo({ ...info, address: e.target.value })} />

        <h2 style={{ marginTop: 20 }}>Contacto</h2>
        <div className="doc-row3">
          <div><label>WhatsApp (solo números)</label><input value={info.whatsapp || ''} onChange={(e) => setInfo({ ...info, whatsapp: e.target.value })} placeholder="50588887777" /></div>
          <div><label>Teléfono</label><input value={info.contact_phone || ''} onChange={(e) => setInfo({ ...info, contact_phone: e.target.value })} /></div>
          <div><label>Correo</label><input value={info.contact_email || ''} onChange={(e) => setInfo({ ...info, contact_email: e.target.value })} /></div>
        </div>
        <div className="doc-row3">
          <div><label>Facebook (link completo)</label><input value={info.facebook || ''} onChange={(e) => setInfo({ ...info, facebook: e.target.value })} placeholder="https://facebook.com/..." /></div>
          <div><label>Instagram (link completo)</label><input value={info.instagram || ''} onChange={(e) => setInfo({ ...info, instagram: e.target.value })} placeholder="https://instagram.com/..." /></div>
        </div>

        {msg && <p className={msg === 'Guardado.' ? 'success' : 'error'}>{msg}</p>}
        <button className="primary" type="submit">Guardar</button>
      </form>

      <div className="card">
        <h2>Líderes</h2>
        {leaders.length === 0 && <p className="muted">Aún no has agregado ningún líder.</p>}
        {leaders.map((l) => (
          <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--line)', padding: '10px 0' }}>
            {l.photo_data ? (
              <img src={l.photo_data} alt={l.full_name} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--moss)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>
                {l.full_name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
              </div>
            )}
            <div style={{ flex: 1 }}>
              <strong>{l.full_name}</strong>
              <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>{l.role_title}</p>
            </div>
            <button className="btn-outline" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => removeLeader(l.id)}>Quitar</button>
          </div>
        ))}

        <form onSubmit={addLeader} style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
          <label>Nombre completo</label>
          <input value={newLeader.full_name} onChange={(e) => setNewLeader((l) => ({ ...l, full_name: e.target.value }))} />
          <label>Cargo</label>
          <input value={newLeader.role_title} onChange={(e) => setNewLeader((l) => ({ ...l, role_title: e.target.value }))} placeholder="Ej. Pastor Principal, Líder de Alabanza" />
          <label>Foto (opcional)</label>
          <input type="file" accept="image/*" onChange={handlePhotoChange} />
          {newLeader.photo_data && (
            <img src={newLeader.photo_data} alt="Vista previa" style={{ width: 60, height: 60, borderRadius: '50%', objectFit: 'cover', marginTop: 8 }} />
          )}
          {leaderMsg && <p className="error">{leaderMsg}</p>}
          <button className="primary" type="submit" style={{ marginTop: 12 }}>+ Agregar líder</button>
        </form>
      </div>
    </div>
  );
}
