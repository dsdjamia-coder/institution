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
    activity: () => window.AppSession.guardStaffPageAccess?.('studentActivity'),
    evaluation: () => window.AppSession.guardStaffPageAccess?.('classroomEvaluation'),
    classroomEvaluation: () => window.AppSession.guardStaffPageAccess?.('classroomEvaluation')
  };

  const runGuard = guardMap[guardKey];
  if (runGuard) runGuard();

  // Universal Header Auto-Hydrator:
  // Automatically hydrates live clock, user name/role badge, active academic year, and institution branding across all official pages.
  const hydrateUniversalHeader = () => {
    try {
      // 1. Live Clock
      const clockEl = document.getElementById('live-clock-display');
      if (clockEl && !clockEl.dataset.clockTicking) {
        clockEl.dataset.clockTicking = 'true';
        const tick = () => {
          const now = new Date();
          clockEl.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        };
        tick();
        setInterval(tick, 1000);
      }

      // 2. User Info (Staff Name & Role Badge)
      const nameEl = document.getElementById('staff-name-display') || document.getElementById('header-user-name');
      const roleEl = document.getElementById('staff-role-badge') || document.getElementById('header-user-role');
      if (window.AppSession?.hasAdminSession?.() && !window.AppSession?.hasStaffSession?.()) {
        if (nameEl) nameEl.textContent = 'Administrator';
        if (roleEl) roleEl.textContent = 'Admin';
      } else if (window.AppSession?.hasStaffSession?.()) {
        const staffState = window.AppSession.getStaffState?.();
        const access = window.AppSession.getStaffAccess?.();
        if (nameEl && staffState?.name && (nameEl.textContent.trim() === 'Staff' || nameEl.textContent.trim() === 'Profile' || nameEl.textContent.trim() === '--')) {
          nameEl.textContent = staffState.name;
        }
        if (roleEl && (roleEl.textContent.trim() === '--' || roleEl.textContent.trim() === 'Staff')) {
          roleEl.textContent = access?.role || access?.type || 'Staff';
        }
      }

      // 3. Active Academic Year
      const yearEl = document.getElementById('header-active-year');
      if (yearEl) {
        const cachedYear = localStorage.getItem('app_active_academic_year') || window.currentWorkingAcademicYear || '';
        if (cachedYear && (yearEl.textContent.includes('Loading') || !yearEl.textContent.trim())) {
          yearEl.textContent = cachedYear;
        }
      }

      // 4. Institution Title & Logo
      const cachedBranding = (function () {
        try {
          const raw = localStorage.getItem('app_inst_branding');
          return raw ? JSON.parse(raw) : null;
        } catch (_) { return null; }
      })();
      if (cachedBranding) {
        const titleEl = document.getElementById('header-title');
        const logoEl = document.getElementById('header-logo');
        if (titleEl && cachedBranding.appName && titleEl.textContent === 'Institution Name') {
          titleEl.textContent = cachedBranding.appName;
        }
        if (logoEl && cachedBranding.logoUrl && (!logoEl.src || logoEl.src.endsWith('logo.png'))) {
          logoEl.src = cachedBranding.logoUrl;
        }
      }
    } catch (err) {
      console.warn('Header auto-hydration notice:', err);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hydrateUniversalHeader);
  } else {
    hydrateUniversalHeader();
  }
})();
