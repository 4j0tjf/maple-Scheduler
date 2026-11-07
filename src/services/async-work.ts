/** 정기 실행과 수동 실행이 겹쳐도 같은 프로세스에서는 한 작업만 실행한다. */
export function singleFlight<T>(work: () => Promise<T>) {
  let running: Promise<T> | undefined;
  return () => {
    if (!running) running = Promise.resolve().then(work).finally(() => { running = undefined; });
    return running;
  };
}
export async function mapLimited<T>(items: T[], limit: number, work: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const item = items[next++]; await work(item); }
  }));
}
