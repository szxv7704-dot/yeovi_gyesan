// Vercel Serverless Function
// 오피넷(Opinet) 무료 유가정보 API 프록시
// - 브라우저에서 오피넷을 직접 호출하면 CORS로 막히고, API 키도 노출되므로
//   서버(Vercel Function)에서 대신 호출한 뒤 결과만 클라이언트로 전달합니다.
//
// 필요한 환경변수 (Vercel 프로젝트 설정 → Environment Variables):
//   OPINET_API_KEY = 오피넷(opinet.co.kr)에서 발급받은 무료 API 키
//
// 참고: 오피넷 무료 API는 "최신 전국 평균가" 기준이며, 특정 과거 일자의
// 유가를 조회하는 기능은 제공하지 않습니다. (출장일자는 참고용으로만 표시됩니다)

module.exports = async function handler(req, res) {
  const apiKey = process.env.OPINET_API_KEY;

  if (!apiKey) {
    res.status(500).json({
      error: "OPINET_API_KEY가 설정되지 않았습니다. Vercel 프로젝트 환경변수를 확인해 주세요.",
    });
    return;
  }

  try {
    const upstream = await fetch(
      `http://www.opinet.co.kr/api/avgAllPrice.do?out=json&code=${apiKey}`
    );

    if (!upstream.ok) {
      res.status(502).json({ error: `오피넷 응답 오류 (status ${upstream.status})` });
      return;
    }

    const data = await upstream.json();

    // 30분 캐시 (오피넷 유가는 일 단위로 갱신되므로 과도한 호출 방지)
    res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: "오피넷 API 호출 중 오류가 발생했습니다: " + err.message });
  }
};
