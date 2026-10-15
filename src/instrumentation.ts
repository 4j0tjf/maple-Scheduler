/**
 * 서버가 켜질 때 한 번 불린다(next start · next dev, 빌드 중에는 불리지 않는다).
 * 지난 주·달 보스 처치를 넥슨에서 채우는 백필을 1시간마다 돌린다. 사이트를 열지 않은 주도 보스 수익에 들어간다.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startBossBackfill } = await import("@/services/boss-backfill");
  startBossBackfill();
}
