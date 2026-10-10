// Quién puede llenar una plantilla personalizada.
// - admin / superadmin: siempre.
// - Si la plantilla tiene encargados asignados (assigned_users): solo ellos.
// - Si no tiene encargados: aplican los roles permitidos (allowed_roles); sin roles = cualquier miembro.
function userCanFill(template, user) {
  if (!template || !user) return false;
  if (['admin', 'superadmin'].includes(user.role)) return true;
  const assigned = Array.isArray(template.assigned_users) ? template.assigned_users.map(Number) : [];
  if (assigned.length > 0) return assigned.includes(Number(user.id));
  return !template.allowed_roles || template.allowed_roles.includes(user.role);
}

module.exports = { userCanFill };
