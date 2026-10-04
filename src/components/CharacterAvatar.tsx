const BOX = { sm: "size-8", md: "size-10", lg: "size-14", xl: "size-28" };
// 그림(96×96)을 그릴 크기: sm 0.83배 · md 1배 · lg 1.5배 · xl 2배. xl은 정수배라 도트를 또렷하게 키운다.
const ART = { sm: "size-20", md: "size-24", lg: "size-36", xl: "size-48 [image-rendering:pixelated]" };

/**
 * 캐릭터 이미지. 넥슨 API의 character_image는 96×96 그림 가운데쯤(머리 y≈34 ~ 발 y≈65)에 캐릭터가 작게 서 있다.
 * 그림 가운데를 원 가운데에 맞추고 크기별로 키워, 작은 원에서도 캐릭터 전체가 가운데에 보이게 한다.
 * 이미지가 없으면(넥슨 키 없음·조회 전) 이름 첫 글자로 대신한다.
 */
export default function CharacterAvatar({ name, image, size = "md" }: { name: string; image: string | null; size?: "sm" | "md" | "lg" | "xl" }) {
  const box = BOX[size];
  if (!image) return <span aria-hidden className={`${box} grid shrink-0 place-items-center rounded-full bg-accent/15 font-bold text-accent ${size === "xl" ? "text-4xl" : size === "lg" ? "text-xl" : "text-sm"}`}>{name.slice(0, 1)}</span>;
  return <span aria-hidden className={`${box} relative shrink-0 overflow-hidden rounded-full bg-surface-2 ring-1 ring-line`}>
    {/* eslint-disable-next-line @next/next/no-img-element -- 넥슨 CDN 이미지라 next/image 원격 설정 없이 그대로 쓴다. */}
    <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" className={`absolute left-1/2 top-1/2 max-w-none -translate-x-1/2 -translate-y-[52%] ${ART[size]}`} />
  </span>;
}
