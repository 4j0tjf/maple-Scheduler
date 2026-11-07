/** 서버 PC에서 한 번 실행. 기존 키는 보존하고 새 값은 화면·로그에 출력하지 않는다. */
import { parse } from "dotenv";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { encryptionKey } from "../src/services/key-encryption";
const contents = existsSync(".env") ? readFileSync(".env", "utf8") : "";
const saved = parse(contents).NEXON_KEY_ENCRYPTION_KEY;
const injected = process.env.NEXON_KEY_ENCRYPTION_KEY;
if (saved && injected && saved !== injected) throw new Error(".env와 실행 환경의 암호화 키가 다릅니다. 기존 암호화 키로 일치시키세요.");
process.env.NEXON_KEY_ENCRYPTION_KEY = injected || saved || "";
if (!process.env.NEXON_KEY_ENCRYPTION_KEY) {
  const key = randomBytes(32).toString("hex");
  const clean = contents.replace(/^(?:export\s+)?NEXON_KEY_ENCRYPTION_KEY\s*=.*$/gm, "");
  writeFileSync(".env", `${clean}\n# 넥슨 API 키 암호화: 별도 안전한 장소에 백업하고 임의 변경하지 마세요.\nNEXON_KEY_ENCRYPTION_KEY="${key}"\n`, { mode: 0o600 });
  process.env.NEXON_KEY_ENCRYPTION_KEY = key;
  console.log("서버 .env에 암호화 키를 생성했습니다. .env를 안전한 별도 장소에 백업하세요.");
}
encryptionKey();
console.log("암호화 키 설정 확인 완료 (값은 출력하지 않습니다).");
