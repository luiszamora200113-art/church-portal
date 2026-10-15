import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { fetchFileBlob, downloadResource, viewKind, fmtDate } from '../bibliotecaApi.js';
import '../biblioteca.css';

// Visor en pantalla (modal). PDF, imágenes y TXT se ven dentro del portal;
// Word/Excel/PowerPoint no se pueden previsualizar en el navegador, para esos se ofrece la descarga.
export default function VisorRecurso({ resource, onClose }) {
  const { token, API_URL } = useAuth();
  const kind = viewKind(resource.file_name);
  const [url, setUrl] = useState(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(kind !== 'none');

  useEffect(() => {
    if (kind === 'none') return undefined;
    let cancelled = false;
    let objectUrl = null;
    fetchFileBlob(resource.id, token, API_URL)
      .then(async (blob) => {
        if (cancelled) return;
        if (kind === 'text') setText(await blob.text());
        else {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        }
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [resource.id]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div className="bib-overlay" onClick={onClose}>
      <div className="bib-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bib-modal-head">
          <div style={{ minWidth: 0 }}>
            <strong className="bib-modal-title">{resource.title}</strong>
            <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>
              {resource.category_name}{resource.published_at ? ` · ${fmtDate(resource.published_at)}` : ''}
            </p>
          </div>
          <div className="bib-modal-actions">
            {url && kind === 'pdf' && (
              <a className="btn-outline" href={url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                Abrir en pestaña
              </a>
            )}
            <button className="btn-outline" onClick={() => downloadResource(resource, token, API_URL).catch((e) => alert(e.message))}>
              Descargar
            </button>
            <button className="btn-outline" onClick={onClose} aria-label="Cerrar">✕</button>
          </div>
        </div>

        <div className="bib-modal-body">
          {loading && <p className="muted center">Cargando documento…</p>}
          {error && <p className="error" style={{ padding: 20 }}>{error}</p>}
          {kind === 'pdf' && url && <iframe className="bib-frame" src={url} title={resource.title} />}
          {kind === 'image' && url && <img className="bib-image" src={url} alt={resource.title} />}
          {kind === 'text' && !loading && !error && <pre className="bib-text">{text}</pre>}
          {kind === 'none' && (
            <div className="bib-nopreview">
              <p style={{ fontSize: 34, margin: 0 }}>📄</p>
              <strong>Este tipo de archivo no se puede mostrar en pantalla</strong>
              <p className="muted" style={{ fontSize: 13 }}>
                Los documentos de Word, Excel y PowerPoint se abren con la descarga. ({resource.file_name})
              </p>
              <button className="primary" style={{ width: 'auto', padding: '10px 20px' }} onClick={() => downloadResource(resource, token, API_URL).catch((e) => alert(e.message))}>
                Descargar archivo
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
