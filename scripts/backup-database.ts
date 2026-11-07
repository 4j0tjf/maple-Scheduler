/** pg_dump의 비밀번호는 인수가 아닌 자식 프로세스 환경으로 전달한다. */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
const output = process.argv[2];
if (!output || existsSync(output)) throw new Error("새 백업 파일 경로가 필요합니다.");
const url = new URL(process.env.DATABASE_URL!);
const result = spawnSync(process.env.PG_DUMP_PATH || "pg_dump", ["--format=custom", "--no-owner", "--no-acl", "--file", output], {
  env: { ...process.env, PGHOST: url.hostname, PGPORT: url.port || "5432", PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    ...(url.searchParams.has("sslmode") ? { PGSSLMODE: url.searchParams.get("sslmode")! } : {}) },
  encoding: "utf8",
});
if (result.error || result.status !== 0 || !existsSync(output) || statSync(output).size === 0) {
  console.error("DB 백업 실패. pg_dump 경로·버전과 DB 연결을 확인하세요. 상세 오류는 비밀정보 보호를 위해 출력하지 않습니다."); process.exitCode = 1;
} else console.log("DB 백업 완료.");
