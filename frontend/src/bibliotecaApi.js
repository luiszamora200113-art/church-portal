// Utilidades compartidas por las pantallas de la Biblioteca Digital.

export const MAX_MB = 15;
export const ACCEPT = '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.jpg,.jpeg,.png';
const ALLOWED_EXT = ACCEPT.replace(/\./g, '').split(',');

export const STATUS_LABEL = {
  pending: 'Pendiente de aprobación',
  approved: 'Aprobado / Publicado',
  rejected: 'Rechazado',
};

export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('es-NI', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

export const fmtSize = (bytes) =>
  bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export const extOf = (name = '') => (name.split('.').pop() || '').toLowerCase();

// Cómo se puede mostrar dentro del portal: pdf | image | text | none (Word/Excel/PowerPoint no se pueden previsualizar en el navegador).
export function viewKind(fileName) {
  const ext = extOf(fileName);
  if (ext === 'pdf') return 'pdf';
  if (['jpg', 'jpeg', 'png'].includes(ext)) return 'image';
  if (ext === 'txt') return 'text';
  return 'none';
}

// Devuelve un mensaje de error si el archivo no sirve, o '' si está bien.
export function validateFile(file) {
  if (!file) return '';
  if (!ALLOWED_EXT.includes(extOf(file.name))) return 'Tipo de archivo no permitido (PDF, Word, PowerPoint, Excel, TXT, JPG o PNG).';
  if (file.size > MAX_MB * 1024 * 1024) return `El archivo supera el máximo de ${MAX_MB} MB.`;
  return '';
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Cliente simple para /api/biblioteca/*
export function makeApi(token, API_URL) {
  return async function api(path, options = {}) {
    const res = await fetch(`${API_URL}/api/biblioteca${path}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No se pudo completar la acción.');
    return data;
  };
}

// El archivo requiere el token, así que se baja como blob y luego se usa en pantalla o se descarga.
export async function fetchFileBlob(resourceId, token, API_URL, download = false) {
  const res = await fetch(`${API_URL}/api/biblioteca/resources/${resourceId}/file${download ? '?download=1' : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'No se pudo abrir el archivo.');
  }
  return res.blob();
}

export async function downloadResource(resource, token, API_URL) {
  const blob = await fetchFileBlob(resource.id, token, API_URL, true);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = resource.file_name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
