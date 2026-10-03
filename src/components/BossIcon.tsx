"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "@/base-path";
import type { Boss } from "@/data/bosses";

/** public/bosses의 아이콘 목록. 화면 하나에서 한 번만 읽는다. */
let loading: Promise<Record<string, string>> | null = null;
function useIcons() {
  const [icons, setIcons] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    loading ??= fetch(apiUrl("/api/boss-icons")).then(response => response.json()).then(data => (data as { icons?: Record<string, string> }).icons ?? {}).catch(() => ({}));
    let alive = true; void loading.then(found => { if (alive) setIcons(found); });
    return () => { alive = false; };
  }, []);
  return icons;
}

/** 보스 단계별 바탕색. 아이콘 파일이 없을 때 이름 글자 아이콘의 색으로 보스 단계를 구분한다. */
function tone(boss: Boss) {
  if (boss.cycle === "monthly") return "bg-[#3b0764] text-[#f5d0fe]";
  if (boss.cycle === "season") return "bg-[#7c2d12] text-[#fed7aa]";
  if (boss.level >= 265) return "bg-[#1e1b4b] text-[#c7d2fe]";
  if (boss.level >= 245) return "bg-[#0f3d3e] text-[#a7f3d0]";
  if (boss.level >= 210) return "bg-[#312e81] text-[#e0e7ff]";
  return "bg-[#44403c] text-[#f5f5f4]";
}

/**
 * 보스 얼굴 아이콘. public/bosses/{key}.png 등이 있으면 그 이미지, 없으면 짧은 이름 글자를 원 안에 보여준다.
 * 이미지는 /api/boss-icons가 직접 읽어 준다(운영 서버는 시작 뒤에 public에 넣은 파일을 주지 않는다).
 */
export default function BossIcon({ boss, size = "md" }: { boss: Boss; size?: "sm" | "md" | "lg" }) {
  const icons = useIcons();
  const box = { sm: "size-8 text-[10px]", md: "size-11 text-xs", lg: "size-14 text-sm" }[size];
  const file = icons?.[boss.key];
  if (file) return <span aria-hidden className={`${box} relative shrink-0 overflow-hidden rounded-full bg-surface-2 ring-1 ring-line`}>
    {/* eslint-disable-next-line @next/next/no-img-element -- 운영 중에 넣는 public 파일이라 빌드 때 크기를 알 수 없다. */}
    <img src={apiUrl(`/api/boss-icons?key=${boss.key}&file=${encodeURIComponent(file)}`)} alt="" className="size-full object-cover" />
  </span>;
  return <span aria-hidden className={`${box} ${tone(boss)} grid shrink-0 place-items-center rounded-full font-bold leading-none tracking-tight ring-1 ring-black/10`}>
    {boss.short.length > 3 ? boss.short.slice(0, 2) : boss.short}
  </span>;
}
