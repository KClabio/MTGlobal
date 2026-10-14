// owner: manages admins (promote/demote/delete) plus everything an admin can do.
// admin: manages content and requests; may delete customers only.
// Nobody can act on themselves or on an owner from the website; owners are managed with scripts/make-admin.js.
const ROLES = ['owner', 'admin', 'customer'];

const ROLE_LABELS = {
  owner: 'Chủ sở hữu',
  admin: 'Quản trị viên',
  customer: 'Khách hàng',
};

function isStaff(role) {
  return role === 'owner' || role === 'admin';
}

function isSelf(actor, target) {
  return String(actor._id) === String(target._id);
}

function canDeleteUser(actor, target) {
  if (!actor || !target || isSelf(actor, target) || target.role === 'owner') return false;
  if (actor.role === 'owner') return true;
  if (actor.role === 'admin') return target.role === 'customer';
  return false;
}

function canChangeRole(actor, target) {
  if (!actor || !target || isSelf(actor, target)) return false;
  return actor.role === 'owner' && target.role !== 'owner';
}

module.exports = { ROLES, ROLE_LABELS, isStaff, canDeleteUser, canChangeRole };
