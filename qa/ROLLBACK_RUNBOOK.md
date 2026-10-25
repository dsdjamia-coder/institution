# Rollback & Recovery Runbook

**System:** Noorul Islam Madrasa Fee Management System  
**Document Code:** QA-RR-01  

---

## 1. Purpose & Triggers
This runbook defines the emergency procedure to roll back deployments or recover Firestore database state in the event of an outage, data integrity defect, or security incident.

### Triggers:
- Core payment collection workflow fails in production.
- Database authorization failure preventing staff or students from accessing portals.
- Build / runtime regression detected after a new release.

---

## 2. Code Deployment Rollback

### Step 1: Check Current Git / Build Status
```bash
git status
npm run lint
npm run build
```

### Step 2: Rollback to Stable Commit
If an unverified release causes frontend regressions:
```bash
git log --oneline -n 5
git checkout <LAST_STABLE_COMMIT_HASH>
npm install
npm run build
```

### Step 3: Service Worker Cache Invalidation
If clients have cached broken assets in `sw.js`:
1. Bump `CACHE_NAME` in `sw.js` (e.g. from `fee-tracker-v26` to `fee-tracker-v27`).
2. Deploy `sw.js`. The `activate` event will delete older caches and fetch fresh assets.

---

## 3. Database Snapshot Recovery

### Step 1: Export Current State (Safety Precaution)
Before executing any rollback or restore, export a snapshot of existing records via:
- Admin Portal -> Security Settings -> Export JSON Backup.

### Step 2: Restore from Verified Archive
1. Open Admin Portal (`admin.html#security-settings`).
2. Under "Restore from Backup", select the last known healthy JSON backup file.
3. Review the preview diff of collections to be restored.
4. Execute Selective or Full Restore.

---

## 4. Verification After Rollback
- [ ] Verify `npm run lint` (`tsc --noEmit`) passes.
- [ ] Verify `npm run build` generates `/dist` without errors.
- [ ] Check `index.html`, `collection.html`, and `student.html` in browser.
