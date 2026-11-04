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

  // Universal Header Auto-Hydrator (5 Standard Elements, Clock Removed)
  const hydrateUniversalHeader = () => {
    try {
      // 1. Remove any clock element as explicitly requested
      const clockEl = document.getElementById('live-clock-display');
      if (clockEl) {
        const parent = clockEl.closest('div');
        if (parent && parent.innerHTML.includes('clock')) {
          parent.remove();
        } else {
          clockEl.remove();
        }
      }

      // 2. User Info & Avatar Photo
      const nameEl = document.getElementById('staff-name-display') || document.getElementById('header-user-name');
      const roleEl = document.getElementById('staff-role-badge') || document.getElementById('header-user-role');
      let userPhoto = localStorage.getItem('app_user_photo') || '';

      if (window.AppSession?.hasAdminSession?.() && !window.AppSession?.hasStaffSession?.()) {
        const adminState = window.AppSession.getAdminState?.();
        if (nameEl) nameEl.textContent = adminState?.name || 'Administrator';
        if (roleEl) roleEl.textContent = 'Admin';
        if (adminState?.photo || adminState?.photoUrl) userPhoto = adminState.photo || adminState.photoUrl;
      } else if (window.AppSession?.hasStaffSession?.()) {
        const staffState = window.AppSession.getStaffState?.();
        const access = window.AppSession.getStaffAccess?.();
        if (nameEl && staffState?.name) nameEl.textContent = staffState.name;
        if (roleEl) roleEl.textContent = access?.role || access?.type || 'Staff';
        if (staffState?.photo || staffState?.photoUrl) userPhoto = staffState.photo || staffState.photoUrl;
      } else if (window.AppSession?.hasStudentSession?.()) {
        const studentState = window.AppSession.getStudentState?.();
        if (nameEl && studentState?.name) nameEl.textContent = studentState.name;
        if (roleEl) roleEl.textContent = studentState?.className ? `Class: ${studentState.className}` : 'Student';
        if (studentState?.photo || studentState?.photoUrl) userPhoto = studentState.photo || studentState.photoUrl;
      }

      const avatarBox = document.getElementById('header-avatar-box') || document.getElementById('official-header-avatar-box');
      const avatarImg = document.getElementById('header-avatar-img');
      const avatarIcon = document.getElementById('header-avatar-icon');
      if (userPhoto && userPhoto.trim()) {
        if (avatarImg) {
          avatarImg.src = userPhoto;
          avatarImg.classList.remove('hidden');
          if (avatarIcon) avatarIcon.classList.add('hidden');
        } else if (avatarBox) {
          avatarBox.innerHTML = `<img src="${userPhoto}" alt="User" class="w-full h-full object-cover rounded-full" onerror="this.onerror=null;this.parentElement.innerHTML='<i class=\\'fas fa-user text-sm\\'></i>';">`;
        }
      }

      // 3. Active Academic Year
      const yearEl = document.getElementById('header-active-year');
      if (yearEl) {
        const cachedYear = localStorage.getItem('app_active_academic_year') || window.currentWorkingAcademicYear || '';
        if (cachedYear && cachedYear.trim() && cachedYear !== '--') {
          yearEl.textContent = cachedYear;
          yearEl.classList.remove('hidden');
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
        if (titleEl && cachedBranding.appName) {
          titleEl.textContent = cachedBranding.appName;
        }
        if (logoEl && (cachedBranding.logoUrl || cachedBranding.appLogo)) {
          logoEl.src = cachedBranding.logoUrl || cachedBranding.appLogo;
          logoEl.style.display = '';
        }
      }

      // 5. Universal Footer
      if (window.UniversalShell?.hydrateFooter) {
        window.UniversalShell.hydrateFooter();
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
