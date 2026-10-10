import http from "node:http";

export function mockFlight(lineCode, ioCode, index, revision = 0) {
  const departure = ioCode === "O";
  const international = lineCode === "I";
  const number = departure && !international && index === 0 ? "RS901"
    : departure && international ? "JL090"
      : !departure && !international ? "TW922" : "MM763";
  return {
    airFln: index === 0 ? number : `ZE${String(200 + index).padStart(3, "0")}`,
    airport: "GMP", city: international ? "HND" : departure ? "CJU" : "PUS", io: ioCode, line: international ? "국제" : "국내",
    airlineKorean: departure ? "에어서울" : "티웨이항공",
    airlineEnglish: departure ? "AIR SEOUL" : "T'WAY AIR",
    boardingKor: departure ? "서울/김포" : international ? "도쿄/하네다" : "부산/김해",
    boardingEng: departure ? "GIMPO" : international ? "TOKYO HANEDA" : "BUSAN GIMHAE",
    arrivedKor: departure ? international ? "도쿄/하네다" : "제주" : "서울/김포",
    arrivedEng: departure ? international ? "TOKYO HANEDA" : "JEJU" : "GIMPO",
    std: `${String(6 + Math.floor(index / 60)).padStart(2, "0")}${String(index % 60).padStart(2, "0")}`,
    etd: departure && !international && index === 0 ? revision ? "0625" : "0615" : "",
    gate: departure ? "3" : null,
    rmkKor: departure ? revision && index === 0 ? "지연" : "출발" : "도착",
    rmkEng: departure ? revision && index === 0 ? "DELAYED" : "DEPARTED" : "ARRIVED"
  };
}

export async function startMockFlightProvider({ domesticDepartureCount = 3, domesticArrivalCount = 1 } = {}) {
  const state = { calls: [], fail: false, revision: 0 };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    const line = url.searchParams.get("schLineType");
    const io = url.searchParams.get("schIOType");
    const page = Number(url.searchParams.get("pageNo"));
    const count = line === "D" ? io === "O" ? domesticDepartureCount : domesticArrivalCount : 1;
    state.calls.push({ line, io, page, rows: url.searchParams.get("numOfRows"), airport: url.searchParams.get("schAirCode"), format: url.searchParams.get("type"), flightFilter: url.searchParams.has("schFln"), key: Boolean(url.searchParams.get("serviceKey")) });
    if (state.fail) { res.writeHead(503); res.end("provider unavailable"); return; }
    const start = (page - 1) * 100;
    const items = Array.from({ length: Math.max(0, Math.min(100, count - start)) }, (_, index) => mockFlight(line, io, start + index, state.revision));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ response: { header: { resultCode: "00", resultMsg: "NORMAL SERVICE." }, body: { items: { item: items }, totalCount: count, numOfRows: 100, pageNo: page } } }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { state, url: `http://127.0.0.1:${server.address().port}/info`, close: () => new Promise((resolve) => server.close(resolve)) };
}
