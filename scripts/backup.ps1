param([string]$BackupRoot)
$ErrorActionPreference = 'Stop'
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (!$BackupRoot) { $BackupRoot = Join-Path (Split-Path $project -Parent) 'maple-Scheduler-backups' }
$destination = Join-Path $BackupRoot (Get-Date -Format 'yyyyMMdd-HHmmss-fff')
[IO.Directory]::CreateDirectory($destination) | Out-Null
# DB와 암호화 키 백업은 현재 관리자, SYSTEM, Administrators만 읽도록 제한한다.
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
& icacls.exe $destination /inheritance:r /grant:r "*${sid}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw '백업 폴더 권한 설정 실패' }
if (!$env:PG_DUMP_PATH -and !(Get-Command pg_dump -ErrorAction SilentlyContinue)) {
    $candidates = @(Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\pg_dump.exe' -ErrorAction SilentlyContinue | Sort-Object FullName -Descending)
    if ($candidates.Count) { $env:PG_DUMP_PATH = $candidates[0].FullName }
}
Push-Location $project
try {
    npx tsx scripts/backup-database.ts (Join-Path $destination 'database.dump')
    if ($LASTEXITCODE -ne 0) { throw 'DB 백업 실패: 서비스 전환을 중단합니다.' }
    Copy-Item -LiteralPath (Join-Path $project '.env') -Destination (Join-Path $destination '.env')
    git rev-parse HEAD | Set-Content (Join-Path $destination 'commit.txt')
    Write-Output "백업 완료: $destination (이 폴더도 서버 밖 안전한 장소에 보관하세요.)"
} finally { Pop-Location }
