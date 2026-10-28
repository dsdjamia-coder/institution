(function () {
  const guardKey = document.documentElement?.dataset?.sessionGuard;
  if (!guardKey || !window.AppSession) return;

  const guardMap = {
    admin: () => window.AppSession.guardAdminPage?.(),
    collection: () => window.AppSession.guardStaffPageAccess?.('collection'),
    result: () => window.AppSession.guardStaffPageAccess?.('result'),
    student: () => window.AppSession.guardStudentPage?.(),
    official: () => window.AppSession.guardStaffOrAdminPage?.(),
    worksheet: () => window.AppSession.guardStaffPageAccess?.('worksheet'),
    attendance: () => window.AppSession.guardStaffPageAccess?.('attendance'),
    academicPlan: () => window.AppSession.guardStaffPageAccess?.('academicPlan'),
    activity: () => window.AppSession.guardStaffPageAccess?.('studentActivity')
  };

  const runGuard = guardMap[guardKey];
  if (runGuard) runGuard();
})();
