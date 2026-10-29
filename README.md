# Maple Scheduler · 스케줄러

등록한 캐릭터의 주간 보스 목록·클리어 여부·결정석 수익과, 재획 사냥 기록·사냥 수익을 한곳에서 관리한다. 시세 사이트(maple-market)와 같은 도메인의 **/scheduler** 에서 열리고, 상단 메뉴 이름은 **스케줄러**다.

| | |
|---|---|
| 주소 | `/scheduler` (Next.js `basePath`) · 탭은 `#bosses` `#crystals` `#hunting` `#hunting-records` `#profit` |
| 서버 | `127.0.0.1:3300` (개발 `3301`, 이 PC 안에서만 열림) |
| DB | 같은 Postgres의 별도 데이터베이스 `maple_scheduler` |
| 넥슨 API | `NEXON_API_KEY` · 캐릭터 기본 정보, 스케줄러(주간 보스 등록·클리어), 사냥 효율용 장비·유니온 등 |
| 조각 시세 | maple-market의 `/api/hunting/price` (사냥 기록과 같다) |

## 화면

로그인하지 않으면 **결정석 가격** 탭만 보이고, 나머지 탭은 로그인·회원가입 카드를 보여준다.

1. **회원가입·로그인**: 아이디(영문·숫자로 시작하는 4~40자, 영문·숫자와 `. _ - @`를 써서 이메일 주소도 가능, 대문자는 소문자로 저장)와 비밀번호(6~72자)만 받는다. scrypt 해시로 저장하고, 세션은 30일짜리 HttpOnly 쿠키(`Path=/scheduler`, `SameSite=Lax`, HTTPS면 `Secure`)다. 쿠키는 계정의 비밀번호 해시로 서명하므로 별도 서버 비밀키가 없다. 아이디별 비밀번호 5회 실패 시 10분 잠금(서버 메모리라 서비스를 재시작하면 풀림), 접속 주소별 가입 시간당 5회.
   - **비밀번호 변경**: 로그인 후 왼쪽 위 '비밀번호 변경'. 지금 비밀번호를 확인한 뒤 바꾸며, 다른 기기의 로그인은 끊기고 이 브라우저는 유지된다.
   - **비밀번호를 잊었을 때(관리자)**: 서버 PC에서 `npm run account:reset`(계정 목록) → `npm run account:reset -- --account "아이디"`가 임시 비밀번호를 만들어 보여 준다. 그 비밀번호로 로그인해 '비밀번호 변경'에서 바꾼다. 캐릭터·기록은 그대로다.
2. **주간 보스** (`#bosses`)
   - **캐릭터 등록**: 게임 캐릭터명을 넣으면 넥슨 API로 찾아 이미지·레벨·직업·월드를 저장한다. 넥슨에 없는 이름은 등록하지 않는다(서버에 키가 없으면 이름만 등록). 계정당 60명.
   - 등록한 캐릭터는 **탭**으로 보인다. 탭에는 이미지·레벨·이번 주 처치 수가 나온다.
   - 캐릭터 탭: 캐릭터 이미지·레벨·직업·월드, **메모**(입력을 멈추면 0.8초 뒤 자동 저장, 2,000자), **보스 목록**(보스 얼굴 아이콘 · 보스 이름 · 난이도 · 인원 수 · 결정석 값 = 1인 판매가 ÷ 인원, 소수점 버림 · 클리어).
   - 보스마다 **삭제** 버튼: 게임 스케줄러에 등록돼 있어도 목록·예상 수익에서 뺀다(챌린저스 월드가 끝난 뒤에도 넥슨 API에 남는 시즌 보스 등). 실수로 지웠으면 목록 아래 '되돌리기'나 '보스 추가'로 다시 넣는다.
   - 캐릭터 정보 아래 **종합**: 계정 전체의 주(목~수)별 결정석 수익, 월간 보스, 그 달 총 수익. 주는 시작일(목요일)이 속한 달에 넣는다(10/29~11/4 주는 10월). ‹ ›로 지난 달을 본다. 지난 주기는 저장된 처치 기록(`boss_clears`, 처치할 때의 판매가 ÷ 인원, 캐릭터마다 몫이 큰 12마리), 이번 주·이번 달은 위쪽 합계와 같은 값이다. 사이트를 열지 않은 주도 서버가 지난 날짜 조회로 채운다(아래 '지난 주·달 처치 채우기').
   - 위쪽 합계: 계정 전체의 이번 주 결정석 수익(처치), 예상 수익(목록 전체), 남은 수익, 이번 달 월간 보스(검은 마법사).
3. **결정석 가격** (`#crystals`): 주간·월간·시즌 보스의 난이도별 1인 판매가, 고른 인원(1~6)의 파티 몫, 2026-09-17 패치 전 대비 변동, 입장 레벨·최대 인원. 가격순·보스순 정렬.
4. **사냥 기록** (`#hunting`): 기존 사냥 기록 화면(화면 인식 스캔·현재 사냥·사냥 순서·조각 시세·사냥 효율)을 그대로 옮겼다. 달라진 점:
   - 캐릭터명·비밀번호 로그인 대신 오른쪽 위 **기록할 캐릭터** 드롭다운에서 계정의 캐릭터를 고른다(이미지·레벨·닉네임·직업·월드, 넥슨 API 값). 스캔 중에는 바꿀 수 없다. 마지막으로 고른 캐릭터를 이 브라우저가 기억한다.
   - **기록 목록**(`#hunting-records`): 기간(오늘·이번 주·최근 30일·전체) 선택, 기간 합계(합계 수익·시간당 수익 포함), **날짜별로 묶은** 표·카드, 기록마다 **합계 수익**(획득 메소 + 조각 환산) 열을 더했다. 보정·증거·삭제·JSON 내보내기는 그대로다.
   - 다른 탭으로 옮겨도 스캔과 기록은 계속된다(패널을 숨기기만 한다).
   - **기존 사냥 기록 가져오기**: 아래 '기존 사냥 기록 옮기기' 참고.
5. **사냥 수익** (`#profit`): 사냥 기록에서 자동으로 계산한다. 입력하는 값은 없다. 캐릭터(전체/하나)·기간(7·30·90일·전체)·묶음(일·주·월) 필터, 오늘·이번 주(목요일부터)·이번 달·선택 기간 합계, 막대그래프(메소·조각 환산), 기간별 표, 캐릭터별 수익.

## 주간 보스 데이터

### 넥슨 스케줄러 API

`GET /maplestory/v1/scheduler/character-state?ocid=` 의 `boss_contents`(보스 이름 `content_name`, 난이도 `difficulty`, 주기 `cycle`, 게임 스케줄러 등록 `registration_flag`, 이번 주기 완료 `complete_flag`)와 `weekly_boss_clear_count`/`weekly_boss_clear_limit_count`를 읽는다. 플래그는 문자열 `"true"`/`"false"`로 온다.

- **목록에 나오는 보스** = 게임 스케줄러에 등록한 보스 + 이번 주기에 완료로 온 보스 + 화면에서 직접 추가한 보스 − 화면에서 삭제한 보스. 일간 보스(`bossDaily`)는 버린다.
- **삭제**(`boss_settings.hidden`): 넥슨 API에 등록·완료로 와도 목록·수익에서 빼고 넥슨 완료를 처치 기록으로 저장하지 않는다. 넥슨 스케줄러에서도 빠지고 이번 주기 처치 기록도 없으면 동기화할 때 삭제 표시를 지운다. 그래서 다음 시즌처럼 게임에서 다시 등록하면 목록에 다시 나온다.
- **난이도** = 처치한 난이도 → 직접 고른 난이도 → 게임에 등록한 난이도.
- **클리어**: 넥슨이 완료로 알려 주면 체크하고 처치 기록(`boss_clears`, source=api)으로 저장한다. 넥슨 반영이 늦을 때는 직접 체크할 수 있고(source=manual), 넥슨이 완료로 확인한 처치는 풀 수 없다.
- 처치 기록에는 그때의 1인 판매가와 인원을 저장하므로, 나중에 가격 패치가 있어도 그 주의 수익은 바뀌지 않는다. 그 주 안에 인원을 바꾸면 처치 기록에도 반영한다.
- 주간 보스는 캐릭터당 12마리(`weekly_boss_clear_limit_count`)까지 결정석을 판다. 처치한 보스를 먼저, 그다음 몫이 큰 보스부터 12마리만 예상 수익에 넣고 나머지는 흐리게 "12마리 초과"로 표시한다. 검은 마법사(월간)·메이린(시즌)은 이 제한과 따로 센다.
- 초기화: 주간 보스 **목요일 0시**, 월간 보스 **매월 1일 0시**(한국 시간). 지난 주기에 받은 응답의 완료 표시는 쓰지 않는다.
- 같은 캐릭터는 5분간 저장본을 쓴다(넥슨 새로고침 버튼은 30초). 7일 넘게 접속하지 않은 캐릭터처럼 주간 보스 항목이 빠진 축약 응답이면 등록·완료 여부를 믿지 않고 직접 추가한 보스만 보여준다.
- **초기화 직후의 지난 주기 클리어**: 넥슨은 주기가 바뀌어도(주간 목요일 0시·월간 1일 0시) 캐릭터가 게임에 접속하기 전까지 **지난 주기 완료 표시를 그대로** 보낸다. 그래서 응답마다 그 완료가 이번 주기 것인지 판정한다(`judgeState`).
  - 그날 접속했는지는 응답에 **일간 보스(`bossDaily`) 항목이 있는지**로 안다(접속하지 않은 날의 응답에는 없다). 화면 동기화에서 본 마지막 접속일은 `characters.active_day`, 지난 날마다의 접속 여부는 아래 백필이 받은 `boss_snapshots`에 있다.
  - 그날 접속했거나 주기 첫날부터 그 전날 사이에 접속한 날이 있으면 그대로 쓴다. 그 사이 모든 날의 접속 여부를 아는데 접속한 날이 없으면 **지난 주기 것**이라 완료를 지우고, 그것으로 잘못 남긴 이번 주기 넥슨 처치 기록도 지운다(직접 체크한 처치는 그대로). 모르는 날이 있으면 완료 표시가 지난 주기 마지막 날과 똑같을 때만 세지 않는다.
  - 완료를 지운 캐릭터는 보스 목록 위에 "초기화 뒤 아직 게임에 접속하지 않아…" 안내가 뜨고, 접속하면 몇 분 뒤(다음 동기화) 이번 클리어가 반영된다.
- **지난 날짜 처치 채우기**(`src/services/boss-backfill.ts`, `src/instrumentation.ts`): 넥슨 스케줄러는 `date=YYYY-MM-DD`로 어제부터 13일 전까지 **그날이 끝난 상태**와 그날 접속했는지를 준다. 서버가 켜진 30초 뒤와 그 뒤 1시간마다 등록된 모든 캐릭터의 그 13일을 받아 `boss_snapshots`에 남기고, 위 판정을 거쳐 처치 기록(source=api)으로 남긴다. 그래서 사이트를 한 번도 열지 않은 주도 보스 수익에 들어간다(서버가 그 주가 끝난 뒤 13일 안에 한 번은 켜져 있어야 한다).
  - 받은 날짜는 다시 부르지 않는다. 처음에 캐릭터당 13건, 그 뒤로는 하루 1건이다. 주기 마지막 날(수요일·그 달 마지막 날)까지 한 번도 접속하지 않은 주기는 그 주기의 넥슨 처치 기록을 지운다.
  - 어제 날짜는 넥슨이 KST 00:00~02:00 무렵 결산 중이라 `OPENAPI00009`를 주고, 그때는 다음 시간에 다시 부른다. 목록에서 삭제한 보스는 채우지 않는다.
  - 받은 건수와 오류는 서비스 로그(`logs`)에 `[보스 기록]`으로 남는다.
- 호출은 서버 전체에서 초당 5건(개발 단계 키 한도)으로 제한한다. 서비스 단계 키면 `src/services/nexon.ts`의 `PER_SECOND`를 올려도 된다.

### 결정석 가격

`src/data/bosses.ts`에 있다. 2026-09-17 패치 가격이고 검은 마법사는 2026-10-01 적용 가격이다. 커뮤니티 정리표 두 곳과 패치 기사 수치를 대조해 넣었다(넥슨 API에는 가격이 없다). 패치로 바뀌면 이 파일의 `price`를 고치고, 직전 가격을 `previous`에 옮겨 적은 뒤 `PRICE_BASIS` 문구를 바꾼다. 이름(`name`)은 넥슨 API `content_name` 표기이며 공백을 빼고 비교한다(진힐라·진 힐라 모두 맞춤). 새 보스는 이 파일에 항목을 더하면 목록·가격표에 같이 나온다.

### 보스 얼굴 아이콘

넥슨 Open API에는 보스 이미지가 없다. `public/bosses/<보스 key>.png`(webp·jpg·gif도 가능)로 복사하면 다시 빌드하거나 재시작하지 않아도 새로고침만으로 보인다(이미지는 `/api/boss-icons`가 직접 읽어 준다). 파일이 없는 보스는 짧은 이름 글자 아이콘으로 대신한다. 넣는 명령 예시와 key 목록은 [docs/boss-icons.md](docs/boss-icons.md). 이 폴더의 이미지는 저장소에 올리지 않는다(저작권 NEXON).

## 기존 사냥 기록 옮기기

기존 사냥 기록(maple-hunt, `/hunting`)은 지우지 않고 그대로 둔다. 상단 메뉴에서만 빼고(`스케줄러`로 바꿈) 주소로 들어가면 지금처럼 쓸 수 있다. 기존 화면 위에는 스케줄러로 옮겼다는 안내가 붙는다.

- **화면에서 각자 옮기기**: 사냥 기록 탭 → 기록 목록 → **기존 사냥 기록 가져오기**에 예전 캐릭터명과 그 캐릭터 비밀번호를 넣는다. 같은 이름의 캐릭터가 계정에 없으면 등록한 뒤 기록과 증거 이미지를 옮긴다. 기록 id를 그대로 쓰므로 여러 번 가져와도 한 벌만 남고, 기존 화면에서 새로 저장한 기록만 더해진다. 기존 캐릭터 하나는 한 계정으로만 가져갈 수 있다. 비밀번호 5회 실패 시 10분 잠금.
- **관리자가 한꺼번에 옮기기**: 먼저 화면에서 회원가입한 뒤

  ```powershell
  npm run hunt:import -- --account <아이디>                      # 옮길 캐릭터와 기록 수만 확인
  npm run hunt:import -- --account <아이디> --names 캐릭A,캐릭B   # 일부 캐릭터만
  npm run hunt:import -- --account <아이디> --apply              # 실제로 옮김
  ```

  다른 계정이 이미 가져간 기존 캐릭터는 건너뛴다. 이미지·레벨은 스케줄러 화면을 열면 넥슨 API에서 채운다.
- 두 방법 모두 `.env`의 `HUNT_DATABASE_URL`(기존 `maple_hunt` DB)을 읽기만 한다. 비워 두면 가져오기 카드가 보이지 않는다.
- 브라우저 저장소: 같은 도메인이라 인식 보정 영역·영상 녹화 설정·그날 직접 넣은 조각 시세는 기존 화면과 같이 쓴다. 진행 중 사냥·업로드 대기열·계산 설정·녹화 보관함은 따로 둔다(`maple-scheduler-*`). 기존 화면에서 진행 중이던 사냥은 기존 화면에서 마무리한다.
- 사냥터 목록은 기존 프로젝트의 `data/hunting-maps.json`을 이 프로젝트 `data/`로 복사한다([docs/hunting-map-data.md](docs/hunting-map-data.md)).

## 시세 사이트(maple-market)에서 할 일

상단 메뉴와 `/scheduler` 주소 연결은 maple-market에 있어 이 저장소에서 바꾸지 못했다. 다음을 maple-market에 적용한다.

1. **메뉴**: `src/components/SiteNav.tsx`의 메뉴 목록에서 `{ href: "/hunting", label: "사냥 기록" }`을 `{ href: "/scheduler", label: "스케줄러" }`로 바꾼다. 같은 메뉴를 복사해 쓰는 MVP작(maple-mvp)도 같이 바꾼다. 이 저장소와 maple-hunt의 `SiteNav.tsx`는 이미 바꿨다.
2. **주소 연결**: `/hunting`과 같은 방식으로 `next.config`의 rewrites에 더한다.

   ```ts
   { source: "/scheduler", destination: "http://127.0.0.1:3300/scheduler" },
   { source: "/scheduler/:path*", destination: "http://127.0.0.1:3300/scheduler/:path*" },
   ```

3. (권장) 터널 규칙: `C:\Users\user\.cloudflared\config.yml`의 전체 규칙(`service: http://127.0.0.1:3000`) **위에** 더하고 `Restart-Service MapleTunnel`.

   ```yaml
     - hostname: 19991115.xyz
       path: ^/scheduler(/.*)?$
       service: http://127.0.0.1:3300
   ```

## 처음 설치 (이 PC 기준, 한 번만)

1. `git clone https://github.com/4j0tjf/maple-Scheduler C:\Development\maple-Scheduler` → 그 폴더에서 `npm ci`
2. `npm run setup -- ..\maple-hunt` — maple-hunt의 `.env`로 이 프로젝트의 `.env`를 만들고(DB 이름만 `maple_scheduler`), DB가 없으면 만들고, 사냥터 목록을 복사하고, 기존 기록 DB 연결을 확인한다. 이미 된 단계는 건너뛰므로 여러 번 실행해도 된다. 직접 하려면 `.env.example`을 복사해 채우고 `CREATE DATABASE maple_scheduler;`.
3. `npx prisma migrate deploy` → `npm run build`(빌드 전에 Prisma 클라이언트 생성과 스캐너 파일 복사를 자동으로 한다. Google 폰트를 받다가 연결 오류가 나면 한 번 더 실행)
4. 서비스 등록 — 관리자 PowerShell. `npm`이 아니라 `next`를 직접 부른다.

   ```powershell
   # nssm.exe 위치: 기존 사냥 기록 서비스(MapleHuntWeb)가 쓰는 것 → PATH → WinGet 설치 폴더 순서로 찾는다. 없으면 winget install NSSM.NSSM
   $nssm = (Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\MapleHuntWeb" -ErrorAction SilentlyContinue).ImagePath -replace '"', ''
   if (-not $nssm -or -not (Test-Path $nssm)) { $nssm = (Get-Command nssm -ErrorAction SilentlyContinue).Source }
   if (-not $nssm) { $nssm = Get-ChildItem "C:\Users\*\AppData\Local\Microsoft\WinGet\Packages" -Recurse -Filter nssm.exe -ErrorAction SilentlyContinue | Where-Object FullName -like "*win64*" | Select-Object -First 1 -ExpandProperty FullName }
   if (-not $nssm) { throw "nssm.exe를 찾지 못했습니다. winget install NSSM.NSSM 후 다시 실행하세요." }
   $node = (Get-Command node).Source
   $root = "C:\Development\maple-Scheduler"
   New-Item -ItemType Directory -Force "$root\logs" | Out-Null
   & $nssm install MapleSchedulerWeb $node "$root\node_modules\next\dist\bin\next" "start" "-p" "3300" "-H" "127.0.0.1"
   & $nssm set MapleSchedulerWeb AppDirectory $root
   & $nssm set MapleSchedulerWeb AppStdout "$root\logs\web.log"
   & $nssm set MapleSchedulerWeb AppStderr "$root\logs\web.log"
   & $nssm start MapleSchedulerWeb
   ```

5. 위 '시세 사이트에서 할 일'을 적용한다.
6. 기존 기록 옮기기(위 절).

## 코드를 고친 뒤 적용

관리자 PowerShell에서 배포 스크립트를 실행한다. 별도 폴더(`SCHEDULER_BUILD_DIR=.next-release-…`)에 빌드한 뒤 서비스가 새 빌드를 쓰도록 전환하고, 실패하면 되돌린다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\deploy.ps1
```

배포 스크립트가 빌드 전에 DB 변경(`npm run db:migrate` = `prisma migrate deploy`)도 적용한다. 배포 스크립트 없이 손으로 빌드할 때는 먼저 `npx prisma migrate deploy`.

## 점검 명령

```powershell
npx tsc --noEmit --incremental false
npx eslint .
npm test
npm run build
npx tsx scripts/check-api.ts http://127.0.0.1:3300/scheduler   # 임시 계정으로 가입·로그인·API 확인 후 그 계정만 지움
```

개발 서버는 `npm run dev` 후 `http://127.0.0.1:3301/scheduler`. 화면 인식(OCR·버프·인벤토리)의 원리·한계·계산식은 기존 사냥 기록 README와 같다(사냥 기록 탭의 '자세한 도움말'에도 있다). 자동 인식 브라우저 점검은 개발 서버의 `/scheduler/scanner-check`.

`NEXON_API_URL`은 시험용 대체 서버를 붙일 때만 쓴다. 운영에서는 비워 둔다.

Data based on NEXON Open API.
