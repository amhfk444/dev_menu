// =====================================================================
// DEV MENU — مميزات الفروع تتبع الحساب الرئيسي لما تتغيّر مميزاته
//   الفرع القديم (بدون مميزات خاصة): ياخذ مميزات الحساب كلها
//   الفرع بمميزاته الخاصة: يحتفظ فيها، وياخذ من الحساب الولاء والرسائل بس
// =====================================================================
const { rest } = require('./core');
const PLANS = require('./plans');

async function followParentFeatures(parentId, features) {
  try { await rest(`clients?parent_id=eq.${parentId}&branch_features=is.null`, { method: 'PATCH', body: { plan_features: features, waitlist_enabled: features.includes('waitlist') } }); } catch {}
  try {
    const own = await rest(`clients?parent_id=eq.${parentId}&branch_features=not.is.null&select=id,branch_features`);
    await Promise.all(own.map(br => {
      const f = PLANS.branchFeatures(br.branch_features, features);
      return rest(`clients?id=eq.${br.id}`, { method: 'PATCH', body: { plan_features: f, waitlist_enabled: f.includes('waitlist') } });
    }));
  } catch {}
}

module.exports = { followParentFeatures };
