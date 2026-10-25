Write-Host "[1/5] JavaScript syntax check"
$jsFiles = Get-ChildItem -Recurse -Path scripts, config -Filter *.js
foreach ($f in $jsFiles) {
    $res = cmd /c "node --check `"$($f.FullName)`" 2>&1"
    if ($LASTEXITCODE -ne 0) { throw "Syntax error in $($f.FullName): $res" }
}
Write-Host "All JS syntax checks passed."

Write-Host "[2/5] Firestore rules security assertions"
$rules = Get-Content firestore.rules -Raw
if ($rules -notmatch "match /institutions/\{institutionId\}/payments/\{docId\}") { throw "Missing payments rule" }
if ($rules -notmatch "allow read: if isAdmin\(institutionId\) \|\| isCollectionSession\(\);") { throw "Missing collection read rule" }
if ($rules -notmatch "match /institutions/\{institutionId\}/academicYears/\{yearId\}/payments/\{docId\}") { throw "Missing academicYears payments rule" }
Write-Host "Firestore rules assertions passed."

Write-Host "[3/5] Accessibility baseline assertions"
$indexHtml = Get-Content index.html -Raw
if ($indexHtml -notmatch 'aria-label="Primary navigation"') { throw "Missing nav aria-label" }
$mainCss = Get-Content styles/main.css -Raw
if ($mainCss -notmatch 'focus-visible') { throw "Missing focus-visible" }
Write-Host "Accessibility assertions passed."

Write-Host "[4/5] Key workflow hooks assertions"
$hooks = @(
    "scripts/pages/collection/entry-module.js",
    "scripts/pages/collection/history-module.js",
    "scripts/pages/collection/reports-module.js",
    "scripts/pages/collection/upload-module.js",
    "scripts/pages/collection/settings-module.js"
)
foreach ($h in $hooks) {
    if (-not (Test-Path $h)) { throw "Missing hook $h" }
}
Write-Host "Workflow hooks assertions passed."

Write-Host "[5/5] Audit + handover docs presence"
$docs = @(
    "APP_AUDIT_REPORT_ML.md",
    "qa/UAT_HANDOVER_CHECKLIST_ML.md",
    "qa/ROLLBACK_RUNBOOK.md"
)
foreach ($d in $docs) {
    if (-not (Test-Path $d)) { throw "Missing doc $d" }
}
Write-Host "Audit and handover docs verified."

Write-Host "ALL 5 REGRESSION GATE CHECKS PASSED!"
