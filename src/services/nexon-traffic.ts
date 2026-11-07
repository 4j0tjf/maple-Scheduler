import { keyFingerprint } from "./key-encryption";
import { ExpiringCache } from "./expiring-cache";

type Waiter = { background: boolean; resolve: () => void };
type Queue = { starts: number[]; pending: Waiter[]; timer?: ReturnType<typeof setTimeout> };
/** 프로세스 내 모든 API/백필이 같은 큐를 공유한다. 키 원문은 인덱스에 남기지 않는다. */
export class KeyRateQueue {
  private queues = new Map<string, Queue>();
  constructor(private limit = 5, private windowMs = 1000, private maxKeys = 2000) {}
  take(key: string, background = false) {
    const id = keyFingerprint(key);
    let queue = this.queues.get(id);
    if (!queue) {
      if (this.queues.size >= this.maxKeys) return Promise.reject(new Error("넥슨 조회 대기열이 가득 찼습니다."));
      queue = { starts: [], pending: [] }; this.queues.set(id, queue);
    }
    if (queue.pending.length >= 500) return Promise.reject(new Error("넥슨 조회 대기열이 가득 찼습니다."));
    const current = queue;
    return new Promise<void>((resolve) => {
      current.pending.push({ background, resolve });
      this.drain(id, current);
    });
  }
  private drain(id: string, queue: Queue) {
    if (queue.timer) clearTimeout(queue.timer);
    queue.starts = queue.starts.filter(at => Date.now() - at < this.windowMs);
    while (queue.pending.length && queue.starts.length < this.limit) {
      const foreground = queue.pending.findIndex(item => !item.background);
      const [waiter] = queue.pending.splice(foreground < 0 ? 0 : foreground, 1);
      queue.starts.push(Date.now()); waiter.resolve();
    }
    if (!queue.starts.length && !queue.pending.length) { this.queues.delete(id); return; }
    queue.timer = setTimeout(() => this.drain(id, queue), Math.max(1, this.windowMs - (Date.now() - queue.starts[0]) + 1));
    // 대기 중인 호출은 완료까지 프로세스를 유지한다. 유휴 정리 타이머만 unref.
    if (!queue.pending.length) queue.timer.unref();
  }
}
export type KeyHealth = { state: "unknown" | "ok" | "invalid" | "limited" | "maintenance" | "unavailable"; checkedAt: string | null; successAt: string | null };
const shared = globalThis as typeof globalThis & { mapleNexonHealth?: ExpiringCache<KeyHealth> };
const health = shared.mapleNexonHealth ??= new ExpiringCache<KeyHealth>(24 * 3600_000, 2000);
export function keyHealth(key: string): KeyHealth {
  return health.get(keyFingerprint(key)) ?? { state: "unknown", checkedAt: null, successAt: null };
}
export function observeKey(key: string, state: KeyHealth["state"]) {
  const at = new Date().toISOString();
  health.set(keyFingerprint(key), { state, checkedAt: at, successAt: state === "ok" ? at : keyHealth(key).successAt });
}
