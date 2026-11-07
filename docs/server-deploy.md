# 서버 PC 배포 (Windows)

대상: `C:\Development\maple-Scheduler`, NSSM 서비스 `MapleSchedulerWeb`, 포트 3300.
관리자 PowerShell에서 실행한다. 이 변경은 계정별 API 키 버전(8dba306)을 포함한다.
현재 브랜치 `codex/account-key-hardening`을 배포한다. 기존 로컬 변경이 있으면 덮어쓰지 말고 먼저 보존한다.

```powershell
Set-Location C:\Development\maple-Scheduler
if (git status --porcelain) { throw '로컬 변경이 있습니다. 변경을 보존한 뒤 다시 실행하세요.' }
git fetch origin codex/account-key-hardening
if ($LASTEXITCODE -ne 0) { throw 'Git 가져오기 실패' }
if (git branch --list codex/account-key-hardening) {
    git switch codex/account-key-hardening
} else {
    git switch --track -c codex/account-key-hardening origin/codex/account-key-hardening
}
if ($LASTEXITCODE -ne 0) { throw '브랜치 전환 실패' }
git pull --ff-only origin codex/account-key-hardening
if ($LASTEXITCODE -ne 0) { throw 'Git 업데이트 실패' }
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\deploy.ps1
if ($LASTEXITCODE -ne 0) { throw '배포 실패: 위 메시지와 logs의 배포 로그를 확인하세요.' }
```

`git fetch` 전에 로컬 변경을 확인한다. `git reset --hard`나 `.env` 덮어쓰기를 하지 않는다.
새 패키지를 추가하지 않아 기본적으로 기존 node_modules를 사용한다. 의존성이 없거나 손상됐다면 마지막 명령에 `-RepairDependencies`를 붙인다. 이 옵션은 서비스 정지 후 `npm ci`를 실행한다.

## 배포 스크립트가 하는 일

1. 암호화 키 설정을 생성/검증한다. 서버의 기존 `.env`와 시스템/서비스 환경에 서로 다른 `NEXON_KEY_ENCRYPTION_KEY`가 있다면 먼저 하나로 맞춘다. 키 값은 채팅·로그에 공유하지 않는다.
2. DB와 `.env`를 `C:\Development\maple-Scheduler-backups\날짜-시간`에 백업하고 폴더 접근을 현재 관리자·SYSTEM·Administrators로 제한한다. `pg_dump`가 없거나 백업이 실패하면 서비스 전환 전에 중단한다. 백업에는 기존 평문 API 키도 들어갈 수 있어 안전하게 보관한다.
3. 테스트, 린트, DB 마이그레이션, 별도 디렉터리 빌드, 타입 검사를 실행한다. 실패하면 새 빌드로 전환하지 않는다.
4. 서비스를 새 빌드로 전환한 뒤 화면 200·비인증 API 401과 임시 계정 가입/인증 API를 점검한다. 실패하면 이전 빌드 환경으로 되돌린다.
5. 정상 서비스 전환 후 기존 평문 API 키를 트랜잭션으로 암호화한다. 이 마지막 단계만 실패하면 새 서비스는 유지하고 오류를 알린다. 원인을 해결한 뒤 `npm run keys:encrypt -- --apply`를 재실행한다.

`pg_dump`는 PATH 또는 `C:\Program Files\PostgreSQL\*\bin`에서 찾는다. 찾지 못하면 설치된 PostgreSQL의 실제 버전 경로를 지정하고 재실행한다.

```powershell
$env:PG_DUMP_PATH = 'C:\Program Files\PostgreSQL\17\bin\pg_dump.exe'
```

DB 서버와 같은 버전 또는 더 최신의 pg_dump를 사용한다. `.env`와 DB 백업을 안전한 서버 밖 장소에도 보관한다. Next 빌드에 Google Fonts, Prisma 엔진 최초 설치에 binaries.prisma.sh 접속이 필요하다.

## 배포 후 확인

```powershell
Set-Location C:\Development\maple-Scheduler
Get-Service MapleSchedulerWeb
(Invoke-WebRequest http://127.0.0.1:3300/scheduler -UseBasicParsing).StatusCode
npx tsx scripts/check-api.ts http://127.0.0.1:3300/scheduler
npm run keys:encrypt
git log -1 --oneline
```

화면 200, API 점검 성공, 키 검증에서 평문 0개를 확인한다. 사이트에서는 서로 다른 두 계정으로 키 등록·교체·삭제, 연결 재확인, 캐릭터·보스·사냥 효율을 확인한다. 넥슨 실제 키가 필요한 점검은 서버 PC에서 수행하고 키 원문을 공유하지 않는다.

연결 상태와 시간은 서버 재시작 후의 요청 기준이다. '등록됨'이 곧 실시간 정상 연결을 뜻하지 않는다. 키 삭제 시 이미 전송된 API 요청은 완료될 수 있고 기존 처치 기록은 보존된다.

## 복구 주의사항

암호화 후 평문 전용 구버전 앱만 실행하면 넥슨 조회가 실패한다. 암호화를 지원하는 이전 빌드로 돌아가거나, 서비스 정지 상태에서 배포 전 DB 백업과 그에 맞는 `.env`를 함께 복원해야 한다. DB 복원은 백업 이후 기록을 되돌릴 수 있으므로 자동으로 실행하지 않는다. 암호화 키를 새로 생성해 덮어쓰지 않는다.

구체적인 배포 커밋은 백업 폴더 `commit.txt`와 `git log -1`로 확인한다. 외부 서버 접속 수단 없이 클라우드에서 수행한 검증은 Windows 서비스 배포 성공을 보장하지 않는다.
