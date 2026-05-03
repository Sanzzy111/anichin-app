/**
 * Vercel Serverless Function — API Proxy
 * Semua request frontend ke /api/proxy akan diteruskan ke API backend.
 * Di browser Network tab, user hanya lihat request ke domain sendiri.
 */

const API_BASE = process.env.API_BASE_URL || "http://localhost:5000";
const API_KEY  = process.env.API_KEY      || "";

export default async function handler(req, res) {
  // Hanya boleh GET
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  // Ambil path dari query param ?path=/episode/slug-nya
  const { path } = req.query;
  if (!path) {
    return res.status(400).json({ message: "Missing path parameter" });
  }

  // Decode dan sanitasi path — cegah path traversal
  let safePath;
  try {
    safePath = decodeURIComponent(path);
    // Pastikan path dimulai dengan /
    if (!safePath.startsWith("/")) safePath = "/" + safePath;
    // Cegah path traversal
    if (safePath.includes("..")) {
      return res.status(400).json({ message: "Invalid path" });
    }
  } catch {
    return res.status(400).json({ message: "Invalid path encoding" });
  }

  const targetUrl = `${API_BASE}${safePath}`;

  try {
    const headers = { "Content-Type": "application/json" };
    if (API_KEY) headers["X-API-Key"] = API_KEY;

    const apiRes = await fetch(targetUrl, {
      method: "GET",
      headers,
      // Timeout 25 detik (Vercel free limit 30s)
      signal: AbortSignal.timeout(25000),
    });

    const data = await apiRes.json();

    // Forward status code dari API
    // Set cache header — browser/CDN cache 5 menit
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    return res.status(apiRes.status).json(data);

  } catch (err) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return res.status(504).json({ message: "Request timeout" });
    }
    console.error("[proxy] error:", err.message, "→", targetUrl);
    return res.status(502).json({ message: "API unreachable" });
  }
}
