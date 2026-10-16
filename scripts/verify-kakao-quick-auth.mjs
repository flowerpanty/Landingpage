import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createKakaoQuickClient, KakaoQuickError } = require("../lib/kakao-quick-client.js");

export async function verifyKakaoQuickAuth({ env = process.env, fetchImpl = global.fetch, write = console.log } = {}) {
  if (!["KAKAO_QUICK_VENDOR_ID", "KAKAO_QUICK_API_KEY", "KAKAO_QUICK_BASE_URL"].every(key => env[key]?.trim())) {
    write("Kakao Quick auth: NOT CONFIGURED");
    return 0;
  }
  try {
    await createKakaoQuickClient({ env, fetchImpl }).checkAuth();
    write("Kakao Quick auth: PASS");
    return 0;
  } catch (error) {
    const safe = error instanceof KakaoQuickError ? error : null;
    write(`Kakao Quick auth: FAIL HTTP status=${safe?.httpStatus ?? "N/A"} Kakao error code=${safe?.kakaoCode ?? "N/A"}`);
    return 1;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = await verifyKakaoQuickAuth();
}
