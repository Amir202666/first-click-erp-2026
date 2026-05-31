# رفع SQL وإظهار أوامر wget للسيرفر
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

$sql = 'scripts\backups\UPLOAD_AS_db_backup.sql'
if (-not (Test-Path $sql)) {
    $latest = Get-ChildItem 'scripts\backups\backup_*.sql' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime | Select-Object -Last 1
    if ($latest) { $sql = $latest.FullName } else { throw 'No backup SQL. Run export-local-db.bat first.' }
}

Write-Host "File: $sql ($((Get-Item $sql).Length) bytes)"
Write-Host 'Uploading to catbox.moe...'

$uri = 'https://catbox.moe/user/api.php'
$form = @{
    reqtype        = 'fileupload'
    fileToUpload   = Get-Item -LiteralPath $sql
}
$response = Invoke-RestMethod -Uri $uri -Method Post -Form $form -TimeoutSec 120

if ($response -notmatch '^https://') {
    throw "Upload failed: $response"
}

Write-Host ''
Write-Host '========== Paste in Hostinger VPS Terminal ==========' -ForegroundColor Green
Write-Host "wget -O /var/www/erp/db_backup.sql `"$response`""
Write-Host 'ls -lh /var/www/erp/db_backup.sql'
Write-Host 'bash /var/www/erp/deploy/publish-all-online.sh'
Write-Host '====================================================' -ForegroundColor Green
Write-Host ''
Write-Host "Link: $response"
