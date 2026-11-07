param([switch]$RepairDependencies)
# 관리자 PowerShell에서 실행. 완성한 새 빌드 폴더로 서비스 환경만 전환한다.
# Next 빌드의 node_modules에는 junction이 있으므로 빌드 디렉터리를 재귀 이동하지 않는다.
# Windows PowerShell 5.1과 PowerShell 7 모두에서 돈다. 5.1이 한글을 읽도록 이 파일은 UTF-8(BOM)로 저장한다.
$ErrorActionPreference = 'Stop'
# HTTP 상태 코드. 401 같은 오류 응답도 숫자로, 연결 실패는 0으로 돌려준다(-SkipHttpErrorCheck는 PowerShell 7 전용이라 쓰지 않는다).
function Get-HttpStatus([string]$Url) {
    try { return [int](Invoke-WebRequest $Url -UseBasicParsing -TimeoutSec 3).StatusCode }
    catch { if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode }; return 0 }
}
# npm은 cmd로 부르고 출력을 파이프로 받아 화면에 쓴 뒤 종료 코드를 돌려준다.
# Windows PowerShell 5.1은 Start-Transcript 중에 외부 프로그램이 콘솔에 직접 쓴 출력을 끝난 뒤 화면 버퍼에서 다시 읽어 기록하는데,
# next build처럼 커서를 움직이며 많이 쓰면 "'node.exe' 프로그램을 실행하지 못했습니다. 인덱스가 배열 범위를 벗어났습니다."를 내며
# 배포를 멈춘다(빌드는 끝났는데 서비스 전환 전에 중단). 파이프로 받으면 node가 콘솔에 직접 쓰지 않아 그 단계를 거치지 않는다.
# stderr는 cmd 안에서 합친다(5.1에서 PowerShell의 2>&1은 stderr 줄을 오류로 바꿔 $ErrorActionPreference='Stop'에 걸린다).
# node는 파이프에 UTF-8로 쓰므로 그동안만 콘솔 인코딩을 UTF-8로 둔다(한글·✓가 깨지지 않게).
function Invoke-Npm([string]$Arguments) {
    $encoding = $null
    try { $encoding = [Console]::OutputEncoding; [Console]::OutputEncoding = New-Object Text.UTF8Encoding $false } catch { $encoding = $null }
    try {
        cmd /d /c "npm $Arguments 2>&1" | Out-Host
        return $LASTEXITCODE
    } finally { if ($encoding) { [Console]::OutputEncoding = $encoding } }
}
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$release = ".next-release-$stamp"
$registry = 'HKLM:\SYSTEM\CurrentControlSet\Services\MapleSchedulerWeb\Parameters'
$config = Get-ItemProperty $registry
if ([IO.Path]::GetFullPath($config.AppDirectory) -ne $project) { throw '서비스 작업 폴더가 이 프로젝트와 다릅니다.' }
$originalEnvironment = @($config.AppEnvironmentExtra | Where-Object { $_ })
$environment = @($originalEnvironment | Where-Object { $_ -notmatch '^SCHEDULER_BUILD_DIR=' }) + @("SCHEDULER_BUILD_DIR=$release")
$logDirectory = Join-Path $project 'logs'
[IO.Directory]::CreateDirectory($logDirectory) | Out-Null
$switched = $false; $stopped = $false
# next build는 빌드 폴더 이름(.next-release-…)을 tsconfig.json include에 넣는다. 배포마다 쌓여 git pull을 막으므로 빌드 뒤 원래대로 돌린다.
$tsconfig = Join-Path $project 'tsconfig.json'
$tsconfigBefore = [IO.File]::ReadAllBytes($tsconfig)
Start-Transcript -Path (Join-Path $logDirectory "deploy-$stamp.log") | Out-Null
Push-Location $project
try {
    if ($RepairDependencies) {
        Stop-Service MapleSchedulerWeb
        (Get-Service MapleSchedulerWeb).WaitForStatus('Stopped', [TimeSpan]::FromSeconds(30))
        $stopped = $true
        $code = Invoke-Npm 'ci --ignore-scripts --prefer-offline --no-audit --no-fund'
        if ($code -ne 0) { throw "의존성 복구 실패: $code" }
    }
    # DB 변경(컬럼 추가 등)을 먼저 적용한다. 지금 도는 빌드도 그대로 쓸 수 있는 변경만 만든다.
    $code = Invoke-Npm 'run db:migrate'
    if ($code -ne 0) { throw "DB 변경 적용 실패: $code" }
    # tsconfig.json은 기본 빌드 폴더(.next)의 타입 파일도 검사한다. 예전 빌드가 남긴 타입 파일이 지금은 없는 화면·API를 가리키면
    # 타입 검사가 실패하므로 지운다(빌드·개발 서버가 다시 만든다). 서비스는 .next-release-… 폴더를 쓰므로 영향이 없다.
    foreach ($stale in @('.next\types', '.next\dev\types')) { Remove-Item -LiteralPath (Join-Path $project $stale) -Recurse -Force -ErrorAction SilentlyContinue }
    $env:SCHEDULER_BUILD_DIR = $release
    $code = Invoke-Npm 'run build'
    if ($code -ne 0) { $code = Invoke-Npm 'run build' }
    if ($code -ne 0) { throw "빌드 실패: $code" }
    if (!(Test-Path -LiteralPath (Join-Path $project "$release/BUILD_ID"))) { throw '완성된 빌드가 없습니다.' }
    if (!$stopped) { Stop-Service MapleSchedulerWeb; (Get-Service MapleSchedulerWeb).WaitForStatus('Stopped', [TimeSpan]::FromSeconds(30)); $stopped=$true }
    New-ItemProperty -Path $registry -Name AppEnvironmentExtra -PropertyType MultiString -Value $environment -Force | Out-Null
    $switched = $true
    Start-Service MapleSchedulerWeb
    $ready = $false
    for ($attempt = 0; $attempt -lt 15; $attempt++) {
        # 화면은 200, 로그인이 필요한 API는 401이면 새 빌드가 뜬 것이다.
        if ((Get-HttpStatus 'http://127.0.0.1:3300/scheduler') -eq 200 -and (Get-HttpStatus 'http://127.0.0.1:3300/scheduler/api/characters') -eq 401) { $ready=$true; break }
        Start-Sleep -Seconds 1
    }
    if (!$ready) { throw '새 빌드 HTTP 확인 실패' }
    Write-Output "운영 반영 완료: $release (이전 빌드는 보존)"
} catch {
    $deploymentError = $_
    if ($switched) {
        Stop-Service MapleSchedulerWeb -ErrorAction SilentlyContinue
        if ($originalEnvironment.Count) { New-ItemProperty -Path $registry -Name AppEnvironmentExtra -PropertyType MultiString -Value $originalEnvironment -Force | Out-Null }
        else { Remove-ItemProperty -Path $registry -Name AppEnvironmentExtra -ErrorAction SilentlyContinue }
    }
    if ($stopped) { Start-Service MapleSchedulerWeb -ErrorAction Continue }
    throw $deploymentError
} finally { [IO.File]::WriteAllBytes($tsconfig, $tsconfigBefore); Pop-Location; Stop-Transcript | Out-Null }
