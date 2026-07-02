// ============================================================================
// 여비 계산기 — 클라이언트 로직
// 거리: 카카오 로컬(키워드) API로 좌표 조회 → 하버사인 공식으로 직선 최소거리
// 유가: /api/opinet (Vercel Function, 오피넷 무료 API 프록시)
// 공식: 유류비 = 거리(km) × (왕복 시 ×2) ÷ 연비(km/L) × 유가(원/L)
// ============================================================================

const MILEAGE = {
  gasoline: { label: "휘발유", value: 11.97 },
  diesel:   { label: "경유",   value: 12.52 },
  lpg:      { label: "LPG(자동차용부탄)", value: 8.83 },
};

// 오피넷 avgAllPrice 응답의 PRODCD 매핑 (코드 우선, 실패 시 이름으로 재탐색)
const OPINET_PRODUCT = {
  gasoline: { code: "B027", nameIncludes: ["휘발유"], nameExcludes: ["고급"] },
  diesel:   { code: "D047", nameIncludes: ["경유"] },
  lpg:      { code: "K015", nameIncludes: ["부탄", "LPG"] },
};

const els = {
  settingsToggle: document.getElementById("settingsToggle"),
  settingsPanel: document.getElementById("settingsPanel"),
  kakaoKeyInput: document.getElementById("kakaoKey"),
  saveKeyBtn: document.getElementById("saveKey"),

  form: document.getElementById("calcForm"),
  tripDate: document.getElementById("tripDate"),
  fuelType: document.getElementById("fuelType"),
  roundTrip: document.getElementById("roundTrip"),
  origin: document.getElementById("origin"),
  destination: document.getElementById("destination"),
  originSuggest: document.getElementById("originSuggest"),
  destSuggest: document.getElementById("destSuggest"),
  submitBtn: document.getElementById("submitBtn"),
  formMsg: document.getElementById("formMsg"),

  resultCard: document.getElementById("resultCard"),
  resultRoute: document.getElementById("resultRoute"),
  routeLineFg: document.getElementById("routeLineFg"),
  tickGroup: document.getElementById("tickGroup"),
  valDistance: document.getElementById("valDistance"),
  valPrice: document.getElementById("valPrice"),
  valMileage: document.getElementById("valMileage"),
  valTrip: document.getElementById("valTrip"),
  valTotal: document.getElementById("valTotal"),
};

// ---------------------------------------------------------------------------
// 설정 패널 (카카오 REST API 키, localStorage에만 저장)
// ---------------------------------------------------------------------------
const KAKAO_KEY_STORAGE = "yeobi_kakao_rest_key";

function loadKakaoKey() {
  const saved = localStorage.getItem(KAKAO_KEY_STORAGE) || "";
  els.kakaoKeyInput.value = saved;
  return saved;
}

els.settingsToggle.addEventListener("click", () => {
  const expanded = els.settingsToggle.getAttribute("aria-expanded") === "true";
  els.settingsToggle.setAttribute("aria-expanded", String(!expanded));
  els.settingsPanel.hidden = expanded;
});

els.saveKeyBtn.addEventListener("click", () => {
  const val = els.kakaoKeyInput.value.trim();
  localStorage.setItem(KAKAO_KEY_STORAGE, val);
  flashMsg(els.settingsPanel, val ? "저장되었습니다." : "키를 입력해 주세요.");
});

function flashMsg(container, text) {
  let el = container.querySelector(".flash");
  if (!el) {
    el = document.createElement("p");
    el.className = "flash";
    el.style.cssText = "margin:8px 2px 0;font-size:12px;color:#4FA88F;";
    container.appendChild(el);
  }
  el.textContent = text;
  setTimeout(() => { el.textContent = ""; }, 2500);
}

loadKakaoKey();
if (!loadKakaoKey()) {
  els.settingsPanel.hidden = false;
  els.settingsToggle.setAttribute("aria-expanded", "true");
}

// ---------------------------------------------------------------------------
// 주소/장소 검색 (카카오 로컬 키워드 검색 API)
// ---------------------------------------------------------------------------
const state = {
  origin: null,      // { name, lat, lng }
  destination: null, // { name, lat, lng }
};

function setupSearch(inputEl, suggestEl, stateKey) {
  let debounceTimer = null;

  inputEl.addEventListener("input", () => {
    state[stateKey] = null; // 사용자가 다시 타이핑하면 선택값 초기화
    clearTimeout(debounceTimer);
    const query = inputEl.value.trim();
    if (query.length < 2) {
      suggestEl.hidden = true;
      suggestEl.innerHTML = "";
      return;
    }
    debounceTimer = setTimeout(() => searchKakao(query, suggestEl, inputEl, stateKey), 350);
  });

  inputEl.addEventListener("blur", () => {
    setTimeout(() => { suggestEl.hidden = true; }, 150);
  });
}

async function searchKakao(query, suggestEl, inputEl, stateKey) {
  const key = localStorage.getItem(KAKAO_KEY_STORAGE);
  if (!key) {
    suggestEl.hidden = true;
    return;
  }
  try {
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=6`,
      { headers: { Authorization: `KakaoAK ${key}` } }
    );
    if (!res.ok) throw new Error(`카카오 API 오류 (${res.status})`);
    const data = await res.json();
    renderSuggestions(data.documents || [], suggestEl, inputEl, stateKey);
  } catch (err) {
    console.error(err);
    suggestEl.innerHTML = `<button type="button" disabled>검색 실패 — 카카오 키를 확인하세요</button>`;
    suggestEl.hidden = false;
  }
}

function renderSuggestions(items, suggestEl, inputEl, stateKey) {
  if (!items.length) {
    suggestEl.innerHTML = `<button type="button" disabled>검색 결과가 없습니다</button>`;
    suggestEl.hidden = false;
    return;
  }
  suggestEl.innerHTML = "";
  items.forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.innerHTML = `${item.place_name}<small>${item.road_address_name || item.address_name}</small>`;
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      inputEl.value = item.place_name;
      state[stateKey] = {
        name: item.place_name,
        lat: parseFloat(item.y),
        lng: parseFloat(item.x),
      };
      suggestEl.hidden = true;
    });
    suggestEl.appendChild(btn);
  });
  suggestEl.hidden = false;
}

setupSearch(els.origin, els.originSuggest, "origin");
setupSearch(els.destination, els.destSuggest, "destination");

// 선택하지 않고 바로 제출한 경우: 입력값으로 1회 검색해 첫 결과를 사용
async function resolvePoint(inputEl, stateKey) {
  if (state[stateKey]) return state[stateKey];
  const query = inputEl.value.trim();
  if (!query) throw new Error("주소를 입력해 주세요.");
  const key = localStorage.getItem(KAKAO_KEY_STORAGE);
  if (!key) throw new Error("설정에서 카카오 REST API 키를 먼저 등록해 주세요.");

  const res = await fetch(
    `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=1`,
    { headers: { Authorization: `KakaoAK ${key}` } }
  );
  if (!res.ok) throw new Error("카카오 검색에 실패했습니다. 키를 확인해 주세요.");
  const data = await res.json();
  const first = (data.documents || [])[0];
  if (!first) throw new Error(`"${query}"에 대한 검색 결과가 없습니다.`);
  const point = { name: first.place_name, lat: parseFloat(first.y), lng: parseFloat(first.x) };
  state[stateKey] = point;
  return point;
}

// ---------------------------------------------------------------------------
// 하버사인 공식 — 직선(최소) 거리
// ---------------------------------------------------------------------------
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ---------------------------------------------------------------------------
// 오피넷 유가 조회 (서버리스 프록시 경유)
// ---------------------------------------------------------------------------
async function fetchFuelPrice(fuelKey) {
  const res = await fetch("/api/opinet");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "유가 정보를 가져오지 못했습니다.");
  }
  const data = await res.json();
  const oilList = data?.RESULT?.OIL || [];
  if (!oilList.length) throw new Error("오피넷 응답에 유가 데이터가 없습니다.");

  const spec = OPINET_PRODUCT[fuelKey];
  let match = oilList.find((o) => o.PRODCD === spec.code);

  if (!match) {
    match = oilList.find((o) => {
      const name = o.PRODNM || "";
      const included = spec.nameIncludes.some((k) => name.includes(k));
      const excluded = (spec.nameExcludes || []).some((k) => name.includes(k));
      return included && !excluded;
    });
  }
  if (!match) throw new Error("해당 유종의 가격 정보를 찾을 수 없습니다.");
  return { price: parseFloat(match.PRICE), label: match.PRODNM };
}

// ---------------------------------------------------------------------------
// 폼 제출 → 계산
// ---------------------------------------------------------------------------
els.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  els.formMsg.textContent = "";
  els.submitBtn.disabled = true;
  els.submitBtn.querySelector("span").textContent = "계산 중…";

  try {
    const [origin, destination] = await Promise.all([
      resolvePoint(els.origin, "origin"),
      resolvePoint(els.destination, "destination"),
    ]);

    const distanceOneWay = haversineKm(origin.lat, origin.lng, destination.lat, destination.lng);
    const roundTrip = els.roundTrip.checked;
    const totalDistance = roundTrip ? distanceOneWay * 2 : distanceOneWay;

    const fuelKey = els.fuelType.value;
    const mileage = MILEAGE[fuelKey];
    const { price, label } = await fetchFuelPrice(fuelKey);

    const fuelCost = (totalDistance / mileage.value) * price;

    renderResult({
      origin, destination,
      distanceOneWay, roundTrip, totalDistance,
      price, priceLabel: label,
      mileage,
      fuelCost,
    });
  } catch (err) {
    console.error(err);
    els.formMsg.textContent = err.message || "계산 중 오류가 발생했습니다.";
  } finally {
    els.submitBtn.disabled = false;
    els.submitBtn.querySelector("span").textContent = "계산하기";
  }
});

function renderResult(r) {
  els.resultCard.hidden = false;
  els.resultRoute.textContent = `${r.origin.name} → ${r.destination.name}`;

  els.valDistance.textContent = `${r.distanceOneWay.toFixed(1)} km`;
  els.valPrice.textContent = `${Math.round(r.price).toLocaleString("ko-KR")}원 / L`;
  els.valMileage.textContent = `${r.mileage.value} km/L (${r.mileage.label})`;
  els.valTrip.textContent = r.roundTrip
    ? `왕복 · ${r.totalDistance.toFixed(1)} km`
    : `편도 · ${r.totalDistance.toFixed(1)} km`;

  const rounded = Math.round(r.fuelCost / 10) * 10;
  els.valTotal.innerHTML = `${rounded.toLocaleString("ko-KR")}<small>원</small>`;

  animateRoute(r.totalDistance);
  els.resultCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// 결과 카드의 경로 시각화 — 거리값을 0~560km 범위로 시각적 스케일링
function animateRoute(distanceKm) {
  const startX = 40, endXMax = 600;
  const scale = Math.min(distanceKm / 560, 1);
  const endX = startX + (endXMax - startX) * Math.max(scale, 0.06);

  els.routeLineFg.setAttribute("x2", startX);
  els.tickGroup.innerHTML = "";
  const tickCount = 8;
  for (let i = 0; i <= tickCount; i++) {
    const x = startX + ((endXMax - startX) / tickCount) * i;
    const tick = document.createElementNS("http://www.w3.org/2000/svg", "line");
    tick.setAttribute("x1", x); tick.setAttribute("x2", x);
    tick.setAttribute("y1", 56); tick.setAttribute("y2", 64);
    els.tickGroup.appendChild(tick);
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      els.routeLineFg.setAttribute("x2", endX);
    });
  });
}

// 오늘 날짜 기본값
els.tripDate.value = new Date().toISOString().slice(0, 10);
