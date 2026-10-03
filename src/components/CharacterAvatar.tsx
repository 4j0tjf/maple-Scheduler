/**
 * 캐릭터 이미지. 넥슨 API의 character_image(전신 그림)를 얼굴 쪽으로 키워 보여준다.
 * 이미지가 없으면(넥슨 키 없음·조회 전) 이름 첫 글자로 대신한다.
 */
export default function CharacterAvatar({ name, image, size = "md" }: { name: string; image: string | null; size?: "sm" | "md" | "lg" | "xl" }) {
  const box = { sm: "size-8", md: "size-10", lg: "size-14", xl: "size-28" }[size];
  if (!image) return <span aria-hidden className={`${box} grid shrink-0 place-items-center rounded-full bg-accent/15 font-bold text-accent ${size === "xl" ? "text-4xl" : size === "lg" ? "text-xl" : "text-sm"}`}>{name.slice(0, 1)}</span>;
  // 전신 그림은 위쪽 1/3에 머리가 있다. 상자를 채우도록 키우고 위쪽을 기준으로 자른다.
  return <span aria-hidden className={`${box} relative shrink-0 overflow-hidden rounded-full bg-surface-2 ring-1 ring-line`}>
    {/* eslint-disable-next-line @next/next/no-img-element -- 넥슨 CDN 이미지라 next/image 원격 설정 없이 그대로 쓴다. */}
    <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" className={size === "xl" ? "absolute inset-0 size-full object-contain" : "absolute left-1/2 top-[8%] h-[190%] w-auto max-w-none -translate-x-1/2 object-contain"} />
  </span>;
}
