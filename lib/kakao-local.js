"use strict";

// https://developers.kakao.com/docs/ko/local/dev-guide#address-coord
const ADDRESS_URL = "https://dapi.kakao.com/v2/local/search/address.json";

class KakaoLocalError extends Error {
  constructor(code) { super("Kakao Local address lookup failed."); this.name = "KakaoLocalError"; this.code = code; }
}

function createKakaoLocalClient({ env = process.env, fetchImpl = global.fetch, timeoutMs = 10000 } = {}) {
  const key = env.KAKAO_LOCAL_REST_API_KEY?.trim();
  if (!key || /[\s\p{C}]/u.test(key)) throw new KakaoLocalError("CONFIGURATION_ERROR");
  let endpoint = ADDRESS_URL;
  if (env.NODE_ENV === "test" && /^http:\/\/127\.0\.0\.1:\d+\/v2\/local\/search\/address\.json$/.test(env.KAKAO_LOCAL_TEST_API_URL || "")) endpoint = env.KAKAO_LOCAL_TEST_API_URL;
  return {
    async geocodeAddress(address) {
      if (typeof address !== "string" || !address.trim() || address.trim().length > 200 || /\p{C}/u.test(address)) throw new KakaoLocalError("INVALID_ADDRESS");
      const url = new URL(endpoint);
      url.searchParams.set("query", address.trim());
      const controller = new AbortController();
      let timer;
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => { reject(new KakaoLocalError("TIMEOUT")); controller.abort(); }, timeoutMs);
      });
      try {
        return await Promise.race([deadline, (async () => {
          const response = await fetchImpl(url.toString(), {
            method: "GET", headers: { Authorization: `KakaoAK ${key}`, Accept: "application/json" },
            redirect: "error", signal: controller.signal
          });
          if (!response.ok) throw new KakaoLocalError("REQUEST_FAILED");
          if (!/^application\/json\s*(?:;|$)/i.test(response.headers.get("content-type") || "")) throw new KakaoLocalError("INVALID_RESPONSE");
          const data = await response.json();
          if (!data || !Array.isArray(data.documents)) throw new KakaoLocalError("INVALID_RESPONSE");
          if (data.documents.length === 0) throw new KakaoLocalError("ADDRESS_NOT_FOUND");
          const coordinate = (value, min, max) => {
            if ((typeof value !== "string" && typeof value !== "number") || String(value).trim() === "") throw new KakaoLocalError("INVALID_RESPONSE");
            const result = Number(value);
            if (!Number.isFinite(result) || result < min || result > max) throw new KakaoLocalError("INVALID_RESPONSE");
            return result;
          };
          return { latitude: coordinate(data.documents[0]?.y, -90, 90), longitude: coordinate(data.documents[0]?.x, -180, 180) };
        })()]);
      } catch (error) {
        if (error instanceof KakaoLocalError) throw error;
        throw new KakaoLocalError("REQUEST_FAILED");
      } finally { clearTimeout(timer); }
    }
  };
}

async function geocodeAddress(address) { return createKakaoLocalClient().geocodeAddress(address); }
module.exports = { createKakaoLocalClient, geocodeAddress, KakaoLocalError };
