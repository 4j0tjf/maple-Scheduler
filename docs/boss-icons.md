# 보스 얼굴 아이콘 (public/bosses)

주간 보스 목록과 결정석 가격표의 보스 얼굴 아이콘을 `public/bosses` 폴더에서 읽는다. 넥슨 Open API에는 보스 이미지가 없어서, 파일이 없는 보스는 짧은 이름 글자 아이콘으로 보인다.

## 넣는 방법

명령은 따로 없다. 이미지 파일을 `public\bosses` 폴더에 **보스 key 이름**으로 복사하면 된다.

```powershell
cd D:\evelopment\maple-Scheduler
Copy-Item "C:\Users\user\Downloads\루시드.png" "public\bosses\lucid.png"
Copy-Item "C:\Users\user\Downloads\검은마법사.webp" "public\bosses\black_mage.webp"
```

- 확장자: `.png` `.webp` `.jpg` `.jpeg` `.gif` (2MB 이하). 한 보스에 여러 개가 있으면 이름순으로 첫 파일을 쓴다.
- 크기: 정사각형 64~128px 권장. 원으로 잘라 보여준다.
- 다시 빌드하거나 서비스를 재시작할 필요 없이 브라우저를 새로고침하면 보인다. 같은 이름의 파일을 바꿔 넣었으면 브라우저가 1시간 동안 예전 그림을 기억할 수 있다(강력 새로고침 Ctrl+F5).
- 인식된 파일 목록: `/scheduler/api/boss-icons` 를 열면 `{ "icons": { "lucid": "lucid.png", … } }`로 보인다.
- 이 폴더의 이미지는 `.gitignore`로 저장소에 올라가지 않는다(게임 이미지 저작권은 NEXON).

## 보스 key

| key | 보스 |
|---|---|
| zakum | 자쿰 |
| magnus | 매그너스 |
| von_bon | 반반 |
| pierre | 피에르 |
| crimson_queen | 블러디퀸 |
| vellum | 벨룸 |
| papulatus | 파풀라투스 |
| lotus | 스우 |
| damien | 데미안 |
| guardian_angel_slime | 가디언 엔젤 슬라임 |
| lucid | 루시드 |
| will | 윌 |
| gloom | 더스크 |
| verus_hilla | 진 힐라 |
| darknell | 듄켈 |
| chosen_seren | 선택받은 세렌 |
| guardian_kalos | 감시자 칼로스 |
| first_adversary | 최초의 대적자 |
| kaling | 카링 |
| radiant_malefic_star | 찬란한 흉성 |
| bellona | 벨로나 |
| limbo | 림보 |
| bardrix | 발드릭스 |
| jupiter | 유피테르 |
| black_mage | 검은 마법사 |
| meirin | 시즌 보스 메이린 |
