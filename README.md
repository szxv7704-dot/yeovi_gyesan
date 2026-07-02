# 여비 계산기

출발지·도착지 주소만 입력하면 **직선(최소)거리 × 오피넷 실시간 유가 ÷ 연비**로
자가용 출장 유류비를 자동 계산하는 개인용 무료 웹 도구입니다.

- 거리: 카카오 로컬(키워드 검색) API로 좌표를 구한 뒤 하버사인 공식으로 직선거리 계산 (API 호출 없이 순수 계산)
- 유가: 오피넷(한국석유공사) 무료 오픈API — 서버리스 함수(`/api/opinet`)가 대신 호출해 CORS/키 노출 문제 해결
- 연비: 인사혁신처 「공무원보수 등의 업무지침」 고정값 (휘발유 11.97, 경유 12.52, LPG 8.83 km/L)

> ⚠️ 참고용 도구입니다. 직선거리는 실제 도로 이동거리보다 짧게 나오며, 오피넷 무료 API는
> "최신 전국 평균가" 기준이라 과거 특정일 유가를 정확히 반영하지 않습니다.
> 공식 정산에는 소속 기관의 여비 규정과 정식 정산 절차를 따르세요.

---

## 1. 필요한 API 키 두 가지

### ① 카카오 REST API 키 (거리 계산용) — 브라우저에서 직접 사용

1. https://developers.kakao.com 접속 → 로그인 → **내 애플리케이션 → 애플리케이션 추가**
2. 생성된 앱의 **REST API 키** 복사
3. 앱 설정 → **플랫폼 → Web** → 사이트 도메인에 배포될 주소 등록
   - 로컬 테스트: `http://localhost:3000`
   - 배포 후: `https://내프로젝트.vercel.app` (커스텀 도메인 쓰면 그 주소도 추가)
4. 배포된 사이트 접속 후 우측 상단 **설정** 패널에 REST API 키를 붙여넣고 저장
   (이 키는 브라우저 `localStorage`에만 저장되며 저장소에 커밋되지 않습니다)

### ② 오피넷 API 키 (유가 조회용) — 서버(Vercel)에서만 사용

1. https://www.opinet.co.kr 접속 → 회원가입
2. **유가정보 API 소개** 페이지에서 **무료 API 이용 신청**
3. 발급받은 Key를 **Vercel 환경변수**로 등록 (아래 4번 참고)

---

## 2. 로컬에서 실행해보기

```bash
npm i -g vercel   # 최초 1회
vercel dev        # 프로젝트 폴더에서 실행 (api/ 폴더의 서버리스 함수까지 함께 구동됨)
```

`vercel dev`는 `/api/opinet.js`를 로컬에서도 그대로 실행해주기 때문에,
정적 파일만 여는 방식(예: VSCode Live Server)으로는 오피넷 연동이 동작하지 않습니다.

로컬 실행 전 오피넷 키를 등록하려면 프로젝트 루트에 `.env` 파일을 만드세요:

```
OPINET_API_KEY=발급받은_오피넷_키
```

---

## 3. GitHub에 올리기

```bash
cd yeobi-calc
git init
git add .
git commit -m "init: 여비 계산기 프로토타입"
git branch -M main
git remote add origin https://github.com/<내계정>/<저장소이름>.git
git push -u origin main
```

`.gitignore`에 `.env`가 포함되어 있어 **오피넷 키가 실수로 커밋되지 않습니다.**
(카카오 키는 애초에 코드/저장소에 들어가지 않고 브라우저에만 저장됩니다)

---

## 4. Vercel로 배포하기

1. https://vercel.com 접속 → GitHub 계정으로 로그인
2. **Add New → Project** → 방금 올린 저장소 선택 → Import
3. Framework Preset은 자동 감지되지 않으면 **Other**로 두고 그대로 진행 (별도 빌드 명령 없음)
4. **Environment Variables**에 아래 값 추가
   | Key | Value |
   |---|---|
   | `OPINET_API_KEY` | 오피넷에서 발급받은 키 |
5. **Deploy** 클릭 → 완료 후 발급되는 `https://프로젝트명.vercel.app` 주소 확인
6. 이 주소를 **카카오 디벨로퍼스 → 플랫폼 → Web 도메인**에 추가 등록 (1번 참고)
7. 배포된 사이트 접속 → 설정 패널에 카카오 REST API 키 입력 → 사용 시작

배포 후 코드를 수정해서 GitHub에 다시 `push`하면 Vercel이 자동으로 재배포합니다.

---

## 5. 폴더 구조

```
yeobi-calc/
├─ index.html        # 메인 페이지 (입력 폼 + 결과 카드)
├─ styles.css         # 디자인
├─ app.js             # 거리 계산 · API 연동 로직
├─ api/
│  └─ opinet.js        # 오피넷 API 프록시 (Vercel 서버리스 함수)
├─ .env.example
├─ .gitignore
└─ README.md
```

## 6. 계산 로직 요약

```
편도거리(km) = 하버사인(출발지 좌표, 도착지 좌표)
이동거리(km) = 왕복 체크 시 편도거리 × 2, 아니면 편도거리
유류비(원)   = 이동거리 ÷ 연비(km/L) × 유가(원/L)
```

연비 상수 및 계산식은 「공무원보수 등의 업무지침」의 자가용 유류비 산정 방식을 참고했습니다.
필요에 따라 `app.js` 상단의 `MILEAGE` 값을 조직 내부 기준으로 바꿔 사용할 수 있습니다.
