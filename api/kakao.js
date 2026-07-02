// Vercel Serverless Function
// 카카오 로컬(키워드 검색) API 프록시
// 브라우저에서 카카오 API를 직접 호출하면 도메인 등록이 복잡하므로
// 서버를 경유해서 호출합니다.

module.exports = async function handler(req, res) {
  const apiKey = process.env.KAKAO_REST_API_KEY;

  if (!apiKey) {
    res.status(500).json({
      error: "KAKAO_REST_API_KEY가 설정되지 않았습니다. Vercel 환경변수를 확인해 주세요.",
    });
    return;
  }

  const { query } = req.query;

  if (!query) {
    res.status(400).json({ error: "query 파라미터가 필요합니다." });
    return;
  }

  try {
    const upstream = await fetch(
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=6`,
      { headers: { Authorization: `KakaoAK ${apiKey}` } }
    );

    if (!upstream.ok) {
      res.status(502).json({ error: `카카오 API 오류 (${upstream.status})` });
      return;
    }

    const data = await upstream.json();
    res.setHeader("Cache-Control", "s-maxage=300");
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: "카카오 API 호출 중 오류: " + err.message });
  }
};
