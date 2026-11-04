/**
 * Universal App Shell Manager
 * Handles:
 * 1. Desktop collapsible sidebar with synchronized header & content transitions.
 * 2. Mobile bottom navigation with 5 dynamic tabs.
 * 3. Bottom nav customizer modal via header hamburger (select any 5 tabs).
 * 4. Universal 5-element header (Logo, Title, Page Title, Academic Year below it, User Profile with photo; Clock removed).
 * 5. Universal 1:1 index-style footer hydration.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.UniversalShell = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  const isDesktop = () => window.innerWidth >= 1024;

  const escapeHtml = (str) => {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  /**
   * Universal Header Hydration (5 Standard Elements, Clock Removed)
   */
  const hydrateHeader = (pageTitle = '') => {
    // 1. Institution Branding (Logo & Name)
    try {
      const brandingRaw = localStorage.getItem('app_inst_branding');
      if (brandingRaw) {
        const branding = JSON.parse(brandingRaw);
        const name = branding.appName || branding.institutionName || branding.name || 'Institution Name';
        const logo = branding.appLogo || branding.institutionLogo || branding.logoUrl || branding.logo || 'assets/images/logo.png';
        
        const titleEl = document.getElementById('header-title');
        if (titleEl) titleEl.textContent = name;
        
        const logoEl = document.getElementById('header-logo');
        if (logoEl && logo) {
          logoEl.src = logo;
          logoEl.style.display = '';
        }
      }
    } catch (_) {}

    // 2. Page Title
    if (pageTitle) {
      const pageTitleEl = document.getElementById('header-page-title');
      if (pageTitleEl) pageTitleEl.textContent = pageTitle;
    }

    // 3. Current Academic Year (Placed directly below Page Title)
    try {
      const cachedYear = localStorage.getItem('app_active_academic_year');
      const yearEl = document.getElementById('header-active-year');
      if (yearEl) {
        if (cachedYear && cachedYear.trim() && cachedYear !== '--') {
          yearEl.textContent = cachedYear;
          yearEl.classList.remove('hidden');
        } else {
          yearEl.textContent = '2026-2027';
        }
      }
    } catch (_) {}

    // 4. Corner User Profile & Avatar Photo
    try {
      let userName = 'Staff';
      let userRole = 'Official';
      let userPhoto = localStorage.getItem('app_user_photo') || '';

      if (window.AppSession) {
        if (window.AppSession.hasAdminSession?.()) {
          const adminState = window.AppSession.getAdminState?.();
          userName = adminState?.name || 'Administrator';
          userRole = 'Admin';
          if (adminState?.photo || adminState?.photoUrl) userPhoto = adminState.photo || adminState.photoUrl;
        } else if (window.AppSession.hasStaffSession?.()) {
          const staffState = window.AppSession.getStaffState?.();
          userName = staffState?.name || 'Staff User';
          userRole = staffState?.role || 'Staff';
          if (staffState?.photo || staffState?.photoUrl) userPhoto = staffState.photo || staffState.photoUrl;
        } else if (window.AppSession.hasStudentSession?.()) {
          const studentState = window.AppSession.getStudentState?.();
          userName = studentState?.name || 'Student';
          userRole = studentState?.className ? `Class: ${studentState.className}` : 'Student';
          if (studentState?.photo || studentState?.photoUrl) userPhoto = studentState.photo || studentState.photoUrl;
        }
      }

      const nameEl = document.getElementById('staff-name-display');
      if (nameEl) nameEl.textContent = userName;

      const roleEl = document.getElementById('staff-role-badge') || document.getElementById('staff-role-display');
      if (roleEl) roleEl.textContent = userRole;

      const avatarBox = document.getElementById('header-avatar-box') || document.getElementById('official-header-avatar-box');
      const avatarImg = document.getElementById('header-avatar-img');
      const avatarIcon = document.getElementById('header-avatar-icon');

      if (userPhoto && userPhoto.trim()) {
        if (avatarImg) {
          avatarImg.src = userPhoto;
          avatarImg.classList.remove('hidden');
          if (avatarIcon) avatarIcon.classList.add('hidden');
        } else if (avatarBox) {
          avatarBox.innerHTML = `<img src="${escapeHtml(userPhoto)}" alt="${escapeHtml(userName)}" class="w-full h-full object-cover rounded-full" onerror="this.onerror=null;this.parentElement.innerHTML='<i class=\\'fas fa-user text-sm\\'></i>';">`;
        }
      } else {
        if (avatarImg) avatarImg.classList.add('hidden');
        if (avatarIcon) avatarIcon.classList.remove('hidden');
      }
    } catch (_) {}

    // 5. Remove any clock element as requested
    const clockEl = document.getElementById('live-clock-display');
    if (clockEl) {
      const clockParent = clockEl.closest('div');
      if (clockParent && clockParent.innerHTML.includes('clock')) {
        clockParent.remove();
      } else {
        clockEl.remove();
      }
    }
  };

  /**
   * Universal Footer Hydration (1:1 with index.html)
   */
  const hydrateFooter = () => {
    try {
      const brandingRaw = localStorage.getItem('app_inst_branding');
      const branding = brandingRaw ? JSON.parse(brandingRaw) : {};
      const instName = branding.appName || branding.institutionName || 'Institution Name';

      const footerInst = document.getElementById('footer-inst-name');
      if (footerInst) footerInst.textContent = instName;

      const phoneEl = document.getElementById('footer-phone');
      const phoneLink = document.getElementById('footer-phone-link');
      if (branding.contactPhone) {
        if (phoneEl) phoneEl.textContent = branding.contactPhone;
        if (phoneLink) phoneLink.href = 'tel:' + branding.contactPhone;
      }

      const emailEl = document.getElementById('footer-email');
      const emailLink = document.getElementById('footer-email-link');
      if (branding.contactEmail) {
        if (emailEl) emailEl.textContent = branding.contactEmail;
        if (emailLink) emailLink.href = 'mailto:' + branding.contactEmail;
      }

      const socialMap = {
        'youtube': branding.socialYouTube,
        'telegram': branding.socialTelegram,
        'instagram': branding.socialInstagram,
        'whatsapp': branding.socialWhatsApp,
        'facebook': branding.socialFacebook
      };

      Object.entries(socialMap).forEach(([key, val]) => {
        const link = document.getElementById('link-' + key);
        if (link) {
          if (val && String(val).trim()) {
            link.href = val;
            link.classList.remove('hidden');
          } else {
            link.classList.add('hidden');
          }
        }
      });
    } catch (_) {}
  };

  /**
   * Main Setup Function
   */
  const setup = (options = {}) => {
    const {
      pageKey = 'app',
      pageTitle = 'Management System',
      availableTabs = [],
      defaultBottomTabs = [],
      onTabSelect = null,
      isStudentPage = false
    } = options;

    const getAppEl = () => document.querySelector('.has-desktop-sidebar') || document.body;

    // --- 1. Desktop Sidebar Management ---
    const setSidebarCollapsed = (collapsed) => {
      const appEl = getAppEl();
      appEl.classList.toggle('sidebar-collapsed', collapsed);
      localStorage.setItem('app_sidebar_collapsed', collapsed ? 'true' : 'false');
      localStorage.setItem(pageKey + '_sidebar_collapsed', collapsed ? 'true' : 'false');
    };

    const toggleSidebar = () => {
      const appEl = getAppEl();
      const isCurrentlyCollapsed = appEl.classList.contains('sidebar-collapsed');
      setSidebarCollapsed(!isCurrentlyCollapsed);
    };

    const initSidebar = () => {
      if (isDesktop()) {
        const stored = localStorage.getItem('app_sidebar_collapsed') || localStorage.getItem(pageKey + '_sidebar_collapsed');
        setSidebarCollapsed(stored === 'true');
      } else {
        setSidebarCollapsed(true);
      }
    };

    document.getElementById('sidebar-collapse-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleSidebar();
    });

    window.addEventListener('resize', () => {
      if (isDesktop()) {
        const stored = localStorage.getItem('app_sidebar_collapsed');
        setSidebarCollapsed(stored === 'true');
      } else {
        setSidebarCollapsed(true);
      }
    });

    initSidebar();

    // --- 2. Header & Footer Hydration ---
    hydrateHeader(pageTitle);
    hydrateFooter();

    // Listen for custom branding updates
    window.addEventListener('app-branding-updated', () => {
      hydrateHeader(pageTitle);
      hydrateFooter();
    });

    // --- 3. Mobile Bottom Navigation & Tab Customizer (Skipped on Student page) ---
    if (isStudentPage) {
      return { setSidebarCollapsed, toggleSidebar };
    }

    const storageKey = 'app_bottom_tabs_' + pageKey;

    const getSelectedBottomTabs = () => {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed.slice(0, 5);
          }
        }
      } catch (_) {}
      return defaultBottomTabs.slice(0, 5);
    };

    const saveSelectedBottomTabs = (tabIds) => {
      localStorage.setItem(storageKey, JSON.stringify(tabIds.slice(0, 5)));
    };

    const bottomNavEl = document.getElementById('mobile-bottom-nav');

    const renderBottomNav = () => {
      if (!bottomNavEl) return;
      const selectedIds = getSelectedBottomTabs();
      const currentActiveId = getActiveTabId();

      const tabsToRender = selectedIds
        .map((id) => availableTabs.find((t) => t.id === id))
        .filter(Boolean);

      bottomNavEl.innerHTML = tabsToRender
        .map((tab) => {
          const isActive = tab.id === currentActiveId;
          return `
            <button type="button" class="universal-bottom-nav-btn ${isActive ? 'active' : ''}" data-tab-id="${escapeHtml(tab.id)}" data-target="${escapeHtml(tab.target || '')}" title="${escapeHtml(tab.label)}">
              <i class="${escapeHtml(tab.icon || 'fas fa-circle')}"></i>
              <span>${escapeHtml(tab.label)}</span>
            </button>
          `;
        })
        .join('');

      bottomNavEl.querySelectorAll('.universal-bottom-nav-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const tabId = btn.dataset.tabId;
          triggerTabActivation(tabId);
        });
      });
    };

    const getActiveTabId = () => {
      const activeLink = document.querySelector('#side-drawer .drawer-link.active') || document.querySelector('.tab-link.active');
      if (!activeLink) return availableTabs[0]?.id || '';
      return activeLink.dataset.tabId || activeLink.dataset.target?.replace('-page', '').replace('-tab', '') || activeLink.getAttribute('href')?.replace('#', '') || '';
    };

    const triggerTabActivation = (tabId) => {
      // 1. Update active state on bottom nav buttons
      if (bottomNavEl) {
        bottomNavEl.querySelectorAll('.universal-bottom-nav-btn').forEach((b) => {
          b.classList.toggle('active', b.dataset.tabId === tabId);
        });
      }

      // 2. Call custom handler if provided
      if (typeof onTabSelect === 'function') {
        const tabObj = availableTabs.find((t) => t.id === tabId);
        onTabSelect(tabId, tabObj);
        return;
      }

      // 3. Fallback: Trigger click on matching drawer-link or tab-link
      const tabLink = document.querySelector(`.drawer-link[data-tab-id="${tabId}"], .drawer-link[href="#${tabId}"], .drawer-link[data-target="${tabId}-page"], .tab-link[href="#${tabId}"], .tab-link[data-target="${tabId}-page"]`);
      if (tabLink) {
        tabLink.click();
      } else {
        window.location.hash = '#' + tabId;
      }
    };

    // --- 4. Mobile Drawer & Bottom Nav Customizer Modal ---
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mobileDrawer = document.getElementById('mobile-nav-drawer') || document.getElementById('mobile-nav-dropdown');

    const toggleMobileDrawer = (open) => {
      if (!mobileDrawer) return;
      const isHidden = mobileDrawer.classList.contains('hidden');
      const willOpen = open !== undefined ? open : isHidden;
      mobileDrawer.classList.toggle('hidden', !willOpen);
    };

    mobileMenuBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMobileDrawer();
    });

    document.addEventListener('click', (e) => {
      if (mobileDrawer && !mobileDrawer.classList.contains('hidden')) {
        if (!mobileDrawer.contains(e.target) && !mobileMenuBtn?.contains(e.target)) {
          toggleMobileDrawer(false);
        }
      }
    });

    // Customizer Modal Initialization
    const customizerModal = document.getElementById('bottom-nav-customizer-modal');
    const openCustomizerBtn = document.getElementById('btn-open-bottom-nav-customizer') || document.getElementById('btn-customize-bottom-nav');
    const closeCustomizerBtn = document.getElementById('btn-close-bottom-nav-customizer');
    const saveCustomizerBtn = document.getElementById('btn-save-bottom-nav-customizer');
    const resetCustomizerBtn = document.getElementById('btn-reset-bottom-nav-customizer');
    const customizerList = document.getElementById('bottom-nav-customizer-list');
    const customizerCounter = document.getElementById('bottom-nav-customizer-count');

    const openCustomizer = () => {
      if (!customizerModal || !customizerList) return;
      toggleMobileDrawer(false);

      const currentSelected = new Set(getSelectedBottomTabs());

      customizerList.innerHTML = availableTabs
        .map((tab) => {
          const isChecked = currentSelected.has(tab.id);
          return `
            <label class="flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition cursor-pointer select-none">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <i class="${escapeHtml(tab.icon || 'fas fa-circle')} text-sm"></i>
                </div>
                <span class="text-xs font-bold text-slate-800">${escapeHtml(tab.label)}</span>
              </div>
              <input type="checkbox" class="bottom-tab-checkbox w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer" data-id="${escapeHtml(tab.id)}" ${isChecked ? 'checked' : ''}>
            </label>
          `;
        })
        .join('');

      const updateCounter = () => {
        const checkedBoxes = customizerList.querySelectorAll('.bottom-tab-checkbox:checked');
        if (customizerCounter) {
          customizerCounter.textContent = `${checkedBoxes.length} / 5 Selected`;
        }
      };

      customizerList.querySelectorAll('.bottom-tab-checkbox').forEach((cb) => {
        cb.addEventListener('change', () => {
          const checked = customizerList.querySelectorAll('.bottom-tab-checkbox:checked');
          if (checked.length > 5) {
            cb.checked = false;
            alert('പരമാവധി 5 ടാബുകൾ മാത്രം തിരഞ്ഞെടുക്കുക / Maximum 5 tabs allowed.');
            return;
          }
          updateCounter();
        });
      });

      updateCounter();
      customizerModal.classList.remove('hidden');
    };

    const closeCustomizer = () => {
      if (customizerModal) customizerModal.classList.add('hidden');
    };

    openCustomizerBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      openCustomizer();
    });

    closeCustomizerBtn?.addEventListener('click', closeCustomizer);

    saveCustomizerBtn?.addEventListener('click', () => {
      if (!customizerList) return;
      const checked = Array.from(customizerList.querySelectorAll('.bottom-tab-checkbox:checked')).map((cb) => cb.dataset.id);
      if (checked.length === 0) {
        alert('ദയവായി കുറഞ്ഞത് 1 ടാബെങ്കിലും തിരഞ്ഞെടുക്കുക / Please select at least 1 tab.');
        return;
      }
      saveSelectedBottomTabs(checked);
      renderBottomNav();
      closeCustomizer();
    });

    resetCustomizerBtn?.addEventListener('click', () => {
      saveSelectedBottomTabs(defaultBottomTabs);
      renderBottomNav();
      closeCustomizer();
    });

    renderBottomNav();

    // Synchronize bottom nav active state whenever hash or tabs change
    window.addEventListener('hashchange', () => {
      setTimeout(() => {
        const activeId = getActiveTabId();
        if (bottomNavEl) {
          bottomNavEl.querySelectorAll('.universal-bottom-nav-btn').forEach((b) => {
            b.classList.toggle('active', b.dataset.tabId === activeId);
          });
        }
      }, 50);
    });

    return {
      setSidebarCollapsed,
      toggleSidebar,
      renderBottomNav,
      openCustomizer,
      hydrateHeader: () => hydrateHeader(pageTitle),
      hydrateFooter
    };
  };

  return {
    setup,
    hydrateHeader,
    hydrateFooter
  };
});
