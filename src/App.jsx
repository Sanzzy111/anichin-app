import { useState, useEffect, useCallback, useRef } from "react";
import { Routes, Route, useNavigate, useParams, Link, useLocation } from "react-router-dom";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const API = process.env.REACT_APP_API_BASE || "http://localhost:5000";

// Slug dari home/search adalah full episode slug:
// "soul-land-2-the-unrivaled-tang-sect-episode-151-subtitle-indonesia"
// Strip bagian "-episode-..." untuk dapat slug donghua-nya
const toDonghuaSlug = (slug) =>
  slug.replace(/-episode-\d[\w-]*$/i, "").replace(/-subtitle-[\w-]*$/i, "");

// episode slug dari info.py adalah full path, contoh:
// "against-the-sky-supreme-episode-1-subtitle-indonesia"
// route /episode/<slug> sudah handle ini

// ─── LOAD SCRIPT HELPER ───────────────────────────────────────────────────────
function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement("script");
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}
function loadLink(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement("link");
  l.rel = "stylesheet"; l.href = href;
  document.head.appendChild(l);
}

// ─── CUSTOM VIDEO PLAYER ──────────────────────────────────────────────────────
// Plyr.js player dengan:
// - Tombol maju/mundur 10 detik
// - Tombol prev/next episode
// - Tombol episode list (panel slide-in saat fullscreen)
// - Pilihan kualitas dari medias[] (direct .mp4)
// - Fallback ke iframe kalau direct link gagal / tidak ada
function CustomPlayer({ epSlug, curNum, prevEp, nextEp, onNavEp, sortedEps, curSlug, iframeUrl }) {
  const videoRef  = useRef(null);
  const plyrRef   = useRef(null);
  const wrapRef   = useRef(null);
  const epPanelRef = useRef(null);

  const [medias,      setMedias]      = useState([]);   // [{quality, url}]
  const [curQuality,  setCurQuality]  = useState(null);
  const [loadingVS,   setLoadingVS]   = useState(true);
  const [useFallback, setUseFallback] = useState(false);
  const [epPanelOpen, setEpPanelOpen] = useState(false);
  const [plyrReady,   setPlyrReady]   = useState(false);
  const [savedTime,   setSavedTime]   = useState(0);

  // ── Fetch /video-source/<slug> ──
  useEffect(() => {
    if (!epSlug) return;
    setLoadingVS(true); setMedias([]); setCurQuality(null); setUseFallback(false);
    apiFetch(`/video-source/${epSlug}`)
      .then(d => {
        const list = d?.medias || [];
        if (!list.length) { setUseFallback(true); return; }
        // Normalisasi format: {quality, url}
        const parsed = list.map((m, i) => ({
          quality: m.quality || m.label || m.resolution || `${i + 1}`,
          url: m.url,
        }));
        setMedias(parsed);
        // Pilih kualitas tertinggi (biasanya 720p)
        const best = parsed.find(m => m.quality.includes("720"))
          || parsed[parsed.length - 1];
        setCurQuality(best);
      })
      .catch(() => setUseFallback(true))
      .finally(() => setLoadingVS(false));
  }, [epSlug]);

  // ── Load Plyr CSS + JS lalu init ──
  useEffect(() => {
    if (useFallback || !curQuality || !videoRef.current) return;

    loadLink("https://cdn.jsdelivr.net/npm/plyr@3/dist/plyr.css");
    loadScript("https://cdn.jsdelivr.net/npm/plyr@3/dist/plyr.polyfilled.js")
      .then(() => {
        // Destroy instance lama
        if (plyrRef.current) { try { plyrRef.current.destroy(); } catch {} plyrRef.current = null; }

        const player = new window.Plyr(videoRef.current, {
          controls: [
            "play-large","play","rewind","fast-forward",
            "progress","current-time","duration",
            "mute","volume","captions","settings","fullscreen",
          ],
          seekTime: 10,
          settings: ["quality","speed"],
          speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] },
          keyboard: { focused: true, global: true },
          tooltips: { controls: true, seek: true },
          invertTime: false,
        });

        player.on("ready", () => setPlyrReady(true));

        // Restore waktu setelah ganti kualitas
        player.on("loadeddata", () => {
          if (savedTime > 0) {
            player.currentTime = savedTime;
            setSavedTime(0);
          }
        });

        plyrRef.current = player;
      })
      .catch(() => setUseFallback(true));

    return () => {
      if (plyrRef.current) { try { plyrRef.current.destroy(); } catch {} plyrRef.current = null; }
      setPlyrReady(false);
    };
  }, [curQuality, useFallback]);

  // ── Ganti kualitas tanpa reload dari awal ──
  const switchQuality = (media) => {
    if (!plyrRef.current || media.url === curQuality?.url) return;
    const t = plyrRef.current.currentTime || 0;
    setSavedTime(t);
    setCurQuality(media);
    // Plyr akan detect src change via <source> key → re-mount via key prop di <video>
  };

  // ── Tombol maju/mundur ──
  const seek = (sec) => { if (plyrRef.current) plyrRef.current.currentTime = Math.max(0, (plyrRef.current.currentTime || 0) + sec); };

  // ── Episode panel: inject ke fullscreen container ──
  useEffect(() => {
    const wrap = wrapRef.current;
    const panel = epPanelRef.current;
    if (!wrap || !panel) return;

    const onFsChange = () => {
      const fsEl = document.fullscreenElement;
      if (fsEl && (fsEl === wrap || fsEl.contains(wrap) || wrap.contains(fsEl))) {
        // masukkan panel ke dalam elemen fullscreen
        fsEl.appendChild(panel);
      } else {
        // kembalikan ke wrap saat keluar fullscreen
        wrap.appendChild(panel);
      }
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // Fallback → iframe biasa
  if (useFallback || (!loadingVS && !medias.length)) {
    if (!iframeUrl) return (
      <div className="video-placeholder">
        <span style={{fontSize:42,opacity:.4}}>📺</span>
        <p>Tidak ada sumber video tersedia</p>
      </div>
    );
    return (
      <iframe src={iframeUrl} className="video-iframe" allowFullScreen
        allow="autoplay; fullscreen; picture-in-picture" title={`Episode ${curNum}`} />
    );
  }

  if (loadingVS) return (
    <div className="video-placeholder">
      <div className="spinner large" />
      <p>Memuat video...</p>
    </div>
  );

  return (
    <div className="cp-wrap" ref={wrapRef}>
      {/* Plyr video element */}
      <video
        ref={videoRef}
        className="cp-video"
        key={curQuality?.url}
        autoPlay
        playsInline
        crossOrigin="anonymous"
      >
        {curQuality && <source src={curQuality.url} type="video/mp4" />}
      </video>

      {/* Overlay tombol custom — muncul di atas Plyr controls */}
      <div className={`cp-overlay ${plyrReady ? "cp-overlay--ready" : ""}`}>
        {/* Seek buttons */}
        <button className="cp-seek-btn cp-seek-left"  onClick={() => seek(-10)} title="Mundur 10 detik">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/><text x="8" y="16" fontSize="7" fill="currentColor" stroke="none" fontWeight="700">10</text></svg>
        </button>
        <button className="cp-seek-btn cp-seek-right" onClick={() => seek(10)}  title="Maju 10 detik">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.49-3.5"/><text x="8" y="16" fontSize="7" fill="currentColor" stroke="none" fontWeight="700">10</text></svg>
        </button>

        {/* Tombol episode list */}
        <button className="cp-ep-list-btn" onClick={() => setEpPanelOpen(v => !v)} title="Daftar Episode">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          <span>Episode</span>
        </button>

        {/* Tombol prev/next episode */}
        <div className="cp-ep-nav">
          <button className="cp-ep-nav-btn" onClick={() => prevEp && onNavEp(prevEp)} disabled={!prevEp} title="Episode Sebelumnya">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
            <span>Prev</span>
          </button>
          <button className="cp-ep-nav-btn" onClick={() => nextEp && onNavEp(nextEp)} disabled={!nextEp} title="Episode Berikutnya">
            <span>Next</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>

        {/* Pilihan kualitas */}
        {medias.length > 1 && (
          <div className="cp-quality">
            {medias.map((m, i) => (
              <button
                key={i}
                className={`cp-quality-btn ${curQuality?.url === m.url ? "active" : ""}`}
                onClick={() => switchQuality(m)}
              >
                {m.quality}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Episode panel (slide-in) */}
      <div ref={epPanelRef} className={`cp-ep-panel ${epPanelOpen ? "open" : ""}`}>
        <div className="cp-ep-panel-header">
          <span>Daftar Episode</span>
          <button className="cp-ep-panel-close" onClick={() => setEpPanelOpen(false)}>✕</button>
        </div>
        <div className="cp-ep-panel-list">
          {sortedEps.map(ep => (
            <button
              key={ep.slug}
              className={`cp-ep-item ${ep.slug === curSlug ? "active" : ""}`}
              onClick={() => { onNavEp(ep); setEpPanelOpen(false); }}
            >
              <span className="cp-ep-num">Ep {ep.episode || "?"}</span>
              {ep.subtitle && <span className="cp-ep-sub">{ep.subtitle}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── STORAGE ──────────────────────────────────────────────────────────────────
const ls = {
  get: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const getHistory  = ()          => ls.get("ach_history")  || {};
const getFavs     = ()          => ls.get("ach_favs")     || {};
const saveHistory = (donghuaSlug, epSlug, epNum, title, thumbnail) => {
  const h = getHistory();
  h[donghuaSlug] = { epSlug, epNum, title, thumbnail, at: Date.now() };
  ls.set("ach_history", h);
};
const toggleFav = (slug, data) => {
  const f = getFavs();
  if (f[slug]) delete f[slug]; else f[slug] = data;
  ls.set("ach_favs", f);
  return !!getFavs()[slug];
};

// ─── FETCH ────────────────────────────────────────────────────────────────────
const apiFetch = async (path) => {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${path}`);
  return res.json();
};

// ─── ICONS ────────────────────────────────────────────────────────────────────
const P = {
  home:    "M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H14v-6h-4v6H4a1 1 0 01-1-1V9.5z",
  search:  "M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z",
  heart:   "M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z",
  play:    "M5 3l14 9-14 9V3z",
  back:    "M19 12H5M12 5l-7 7 7 7",
  tag:     "M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82zM7 7h.01",
  clock:   "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zm0-6v-4l3 3",
  star:    "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
  list:    "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  chevR:   "M9 18l6-6-6-6",
  chevL:   "M15 18l-6-6 6-6",
  chevD:   "M6 9l6 6 6-6",
  film:    "M2 8h20M2 16h20M8 2v4M16 2v4M8 18v4M16 18v4M2 2h20v20H2z",
  ext:     "M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3",
  warn:    "M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4m0 4h.01",
  retry:   "M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15",
  tv:      "M21 3H3a2 2 0 00-2 2v12a2 2 0 002 2h18a2 2 0 002-2V5a2 2 0 00-2-2zM7 21h10m-5-4v4",
};
const Ic = ({ n, s = 20, className = "" }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d={P[n]} />
  </svg>
);

// ─── SHARED COMPONENTS ────────────────────────────────────────────────────────
const IMG_FB = "https://placehold.co/300x420/13131f/e94560?text=No+Image";

const Spinner = ({ text = "Memuat..." }) => (
  <div className="spinner-wrap">
    <div className="spinner" />
    <span>{text}</span>
  </div>
);

const ErrBox = ({ msg, onRetry }) => (
  <div className="err-box">
    <Ic n="warn" s={36} />
    <p>{msg}</p>
    {onRetry && (
      <button className="btn-primary" onClick={onRetry}>
        <Ic n="retry" s={14} /> Coba Lagi
      </button>
    )}
  </div>
);

// ─── CARD ─────────────────────────────────────────────────────────────────────
const DonghuaCard = ({ item }) => {
  const nav      = useNavigate();
  const history  = getHistory();
  const donghuaSlug = toDonghuaSlug(item.slug);
  const watched  = history[donghuaSlug];
  return (
    <div className="card" onClick={() => nav(`/detail/${toDonghuaSlug(item.slug)}`)}>
      <div className="card-img">
        <img src={item.thumbnail || IMG_FB} alt={item.title}
          onError={e => { e.target.src = IMG_FB; }} />
        <div className="card-overlay">
          <div className="play-circle"><Ic n="play" s={16} /></div>
        </div>
        {item.type && item.type !== "Unknown" && (
          <span className="card-badge">{item.type}</span>
        )}
        {item.eps && <span className="card-eps">Ep {item.eps}</span>}
        {watched && (
          <div className="card-watched">▶ Ep {watched.epNum}</div>
        )}
      </div>
      <p className="card-title">{item.title}</p>
    </div>
  );
};

// ─── NAVBAR ───────────────────────────────────────────────────────────────────
const Navbar = () => {
  const nav      = useNavigate();
  const location = useLocation();
  const [q, setQ] = useState("");

  const onSearch = (e) => {
    e.preventDefault();
    if (q.trim()) { nav(`/search/${encodeURIComponent(q.trim())}`); setQ(""); }
  };

  const links = [
    { to: "/",          icon: "home",   label: "Home"   },
    { to: "/genres",    icon: "tag",    label: "Genre"  },
    { to: "/favorites", icon: "heart",  label: "Favorit" },
  ];

  return (
    <nav className="navbar">
      <div className="nav-logo" onClick={() => nav("/")}>
        ANICHIN<span>.</span>
      </div>
      <form className="nav-search" onSubmit={onSearch}>
        <input value={q} onChange={e => setQ(e.target.value)}
          placeholder="Cari donghua..." className="search-input" />
        <button type="submit" className="search-btn">
          <Ic n="search" s={15} />
        </button>
      </form>
      <div className="nav-links">
        {links.map(l => (
          <button key={l.to}
            className={`nav-link ${location.pathname === l.to ? "active" : ""}`}
            onClick={() => nav(l.to)}>
            <Ic n={l.icon} s={17} />
            <span>{l.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
};

// ─── HOME PAGE ────────────────────────────────────────────────────────────────
const HomePage = () => {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState(null);
  const [page,    setPage]    = useState(1);
  const nav = useNavigate();
  const history = getHistory();

  const load = useCallback(() => {
    setLoading(true); setErr(null);
    apiFetch(`/?page=${page}`)
      .then(setData)
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const histItems = Object.entries(history)
    .sort(([, a], [, b]) => b.at - a.at)
    .slice(0, 6);

  return (
    <div className="page">
      {/* Hero */}
      <div className="hero">
        <p className="hero-eyebrow">Selamat datang di</p>
        <h1 className="hero-title">ANICHIN<span>.</span></h1>
        <p className="hero-sub">Streaming donghua sub indo terlengkap & terupdate</p>
      </div>

      {/* Continue Watching */}
      {histItems.length > 0 && (
        <section className="section">
          <h2 className="section-title"><span className="accent-bar">▍</span>Lanjutkan Menonton</h2>
          <div className="continue-carousel">
            {histItems.map(([slug, h]) => (
              <div key={slug} className="continue-card" onClick={() => nav(`/detail/${toDonghuaSlug(slug)}`)}>
                <div className="continue-card-img">
                  <img src={h.thumbnail || IMG_FB} alt={h.title}
                    onError={e => e.target.src = IMG_FB} />
                  <div className="continue-card-play"><Ic n="play" s={16} /></div>
                </div>
                <p className="continue-card-title">{h.title}</p>
                <p className="continue-card-ep"><Ic n="play" s={10} /> Ep {h.epNum}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {loading && <Spinner />}
      {err     && <ErrBox msg={err} onRetry={load} />}

      {data?.results
        ?.filter(sec => !sec.section.toLowerCase().includes("blog"))
        .map(sec => (
          <section key={sec.section} className="section">
            <h2 className="section-title">
              <span className="accent-bar">▍</span>
              {sec.section.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
            </h2>
            <div className="cards-grid">
              {sec.cards.map(item => <DonghuaCard key={item.slug} item={item} />)}
            </div>
          </section>
        ))}

      <div className="pagination">
        <button className="page-btn" onClick={() => { setPage(p => Math.max(1, p - 1)); window.scrollTo({top:0,behavior:"smooth"}); }} disabled={page <= 1}>
          <Ic n="chevL" s={14} /> Prev
        </button>
        <span className="page-num">Halaman {page}</span>
        <button className="page-btn" onClick={() => { setPage(p => p + 1); window.scrollTo({top:0,behavior:"smooth"}); }}>
          Next <Ic n="chevR" s={14} />
        </button>
      </div>
    </div>
  );
};

// ─── SEARCH PAGE ──────────────────────────────────────────────────────────────
const SearchPage = () => {
  const { query }  = useParams();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState(null);

  useEffect(() => {
    if (!query) return;
    setLoading(true); setErr(null); setData(null);
    apiFetch(`/search/${query}`)
      .then(setData)
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [query]);

  return (
    <div className="page">
      <div className="page-header">
        <h2>Hasil pencarian: <span className="accent">"{decodeURIComponent(query)}"</span></h2>
      </div>
      {loading && <Spinner />}
      {err     && <ErrBox msg={err} />}
      {data && (
        <>
          <p className="result-count">{data.results?.length || 0} hasil ditemukan</p>
          {!data.results?.length
            ? <div className="empty-state"><Ic n="search" s={48} /><p>Tidak ada hasil</p></div>
            : <div className="cards-grid">{data.results.map(i => <DonghuaCard key={i.slug} item={i} />)}</div>
          }
        </>
      )}
    </div>
  );
};

// ─── GENRES PAGE ──────────────────────────────────────────────────────────────
const GenresPage = () => {
  const nav = useNavigate();
  const [genres,  setGenres]  = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/genres")
      .then(d => setGenres(d.genres || []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;

  return (
    <div className="page">
      <div className="page-header"><h2>Genre Donghua</h2></div>
      <div className="genres-grid">
        {genres.map(g => (
          <button key={g.slug || g.name} className="genre-chip"
            onClick={() => nav(`/genre/${g.slug || g.name}`, { state: { name: g.name } })}>
            <Ic n="tag" s={13} />{g.name}
          </button>
        ))}
      </div>
    </div>
  );
};

// ─── GENRE DETAIL PAGE ────────────────────────────────────────────────────────
const GenreDetailPage = () => {
  const { slug }   = useParams();
  const location   = useLocation();
  const genreName  = location.state?.name || slug;
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [page,    setPage]    = useState(1);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/genre/${slug}?page=${page}`)
      .then(setData)
      .finally(() => setLoading(false));
  }, [slug, page]);

  return (
    <div className="page">
      <div className="page-header">
        <h2>Genre: <span className="accent">{genreName}</span></h2>
      </div>
      {loading && <Spinner />}
      {data && <div className="cards-grid">{data.results?.map(i => <DonghuaCard key={i.slug} item={i} />)}</div>}
      <div className="pagination">
        <button className="page-btn" onClick={() => { setPage(p => Math.max(1, p-1)); window.scrollTo({top:0,behavior:"smooth"}); }} disabled={page<=1}>
          <Ic n="chevL" s={14} /> Prev
        </button>
        <span className="page-num">Hal {page}</span>
        <button className="page-btn" onClick={() => { setPage(p => p+1); window.scrollTo({top:0,behavior:"smooth"}); }}>
          Next <Ic n="chevR" s={14} />
        </button>
      </div>
    </div>
  );
};

// ─── FAVORITES PAGE ───────────────────────────────────────────────────────────
const FavoritesPage = () => {
  const [favs, setFavs] = useState(getFavs());
  useEffect(() => { setFavs(getFavs()); }, []);
  const items = Object.values(favs);

  return (
    <div className="page">
      <div className="page-header"><h2>Favorit Saya</h2></div>
      {!items.length
        ? <div className="empty-state"><Ic n="heart" s={48} /><p>Belum ada favorit</p></div>
        : <div className="cards-grid">{items.map(i => <DonghuaCard key={i.slug} item={i} />)}</div>
      }
    </div>
  );
};

// ─── DETAIL PAGE ──────────────────────────────────────────────────────────────
const DetailPage = () => {
  const { slug }   = useParams();
  const nav        = useNavigate();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState(null);
  const [isFav,   setIsFav]   = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(() => {
    setLoading(true); setErr(null);
    apiFetch(`/${slug}`)
      .then(d => { setData(d); setIsFav(!!getFavs()[slug]); })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="page">
      <div className="ske" style={{ height: 420 }} />
      <div className="ske" style={{ height: 200, margin: "16px 20px" }} />
      <div className="ske" style={{ height: 160, margin: "16px 20px" }} />
    </div>
  );
  if (err)           return <ErrBox msg={err} onRetry={load} />;
  if (!data?.result) return <ErrBox msg="Data tidak ditemukan" />;

  const r = data.result;

  // ── mapping field sesuai info.py to_json() ──
  // result = { **info_details, name, thumbnail, genre, rating, sinopsis, episode }
  // info_details dari spe div: key = label lowercased, e.g. "status", "studio", "jumlah_episode", dll
  const title     = r.name        || "Unknown Title";
  const thumb     = r.thumbnail   || IMG_FB;
  const genres    = r.genre       || [];           // array of string
  const rating    = r.rating;
  const episodes  = r.episode     || [];           // [{ slug, subtitle, date, episode, thumbnail }]
  const sinopsis  = (() => {
    if (!r.sinopsis) return "";
    if (typeof r.sinopsis === "string") return r.sinopsis;
    if (r.sinopsis.paragraphs?.length) return r.sinopsis.paragraphs.filter(Boolean).join("\n\n");
    return "";
  })();

  // info_details keys: bisa "status", "studio", "jumlah_episode", "tipe", "skor", "tanggal_rilis", dll
  // Ambil semua kecuali yang sudah di-handle
  const skip = new Set(["name","thumbnail","genre","rating","sinopsis","episode"]);
  const extraInfo = Object.entries(r).filter(([k]) => !skip.has(k) && typeof r[k] === "string" && r[k]);

  const status   = r.status || r.Status;
  const totalEps = r.jumlah_episode || r.total_episode || r["total episode"] || (episodes.length > 0 ? episodes.length : null);

  const isOngoing = status && /ongoing|berlangsung|airing/i.test(status);

  // Urutkan episode ascending by nomor
  const sortedEps = [...episodes].sort((a, b) => {
    const na = parseFloat(a.episode) || 0;
    const nb = parseFloat(b.episode) || 0;
    return na - nb;
  });

  const history   = getHistory();
  const watched   = history[slug];
  const firstEp   = sortedEps[0];
  // episode yang terakhir ditonton (berdasarkan slug)
  const resumeEp  = watched
    ? (sortedEps.find(e => e.slug === watched.epSlug) || sortedEps[sortedEps.length - 1])
    : null;

  const handleFav = () => setIsFav(toggleFav(slug, { slug, title, thumbnail: thumb, type: r.tipe || r.type, eps: totalEps }));

  // slug episode sudah full path, tinggal encode dan navigasi
  const goWatch = (ep) => {
    nav(`/watch/${encodeURIComponent(ep.slug)}`, {
      state: {
        epNum:       ep.episode,
        donghuaSlug: slug,
        title,
        thumb,
        epList:      sortedEps,
      }
    });
  };

  const displayEps = showAll ? sortedEps : sortedEps.slice(0, 36);

  // Tampilkan info yang relevan
  const infoMap = [
    ["Status",       status],
    ["Total Episode", totalEps],
    ["Studio",       r.studio || r.Studio],
    ["Tipe",         r.tipe || r.type || r.Tipe],
    ["Tayang",       r.tanggal_rilis || r.released || r["tanggal tayang"] || r["tanggal_tayang"]],
    ["Season",       r.season || r.Season],
    ["Durasi",       r.durasi || r.duration],
    ["Negara",       r.negara || r.country],
    ["Sutradara",    r.sutradara || r.director],
    ["Skor",         r.skor || rating],
  ].filter(([, v]) => v);

  return (
    <div className="page">
      {/* ── Hero ── */}
      <div className="det-hero" style={{ "--thumb": `url(${thumb})` }}>
        <div className="det-hero-blur" />
        <div className="det-hero-content">
          <button className="back-btn" onClick={() => nav("/")}>
            <Ic n="back" s={16} /> Kembali
          </button>

          <div className="det-layout">
            <img src={thumb} alt={title} className="det-poster"
              onError={e => { e.target.src = IMG_FB; }} />

            <div className="det-info">
              {/* badges */}
              <div className="det-badges">
                {(r.tipe || r.type) && <span className="badge badge-type">{r.tipe || r.type}</span>}
                {status && (
                  <span className={`badge ${isOngoing ? "badge-on" : "badge-done"}`}>
                    {isOngoing ? "🟢 " : "✅ "}{status}
                  </span>
                )}
                {(r.skor || rating) && (
                  <span className="badge badge-score">
                    <Ic n="star" s={11} /> {r.skor || rating}
                  </span>
                )}
              </div>

              <h1 className="det-title">{title}</h1>

              {/* Stats row */}
              <div className="det-stats">
                {totalEps && <span><Ic n="list" s={13} /> {totalEps} Episode</span>}
                {(r.tanggal_rilis || r.released) && (
                  <span><Ic n="clock" s={13} /> {r.tanggal_rilis || r.released}</span>
                )}
                {(r.durasi || r.duration) && <span>⏱ {r.durasi || r.duration}</span>}
                {(r.season || r.Season) && <span>📅 {r.season || r.Season}</span>}
              </div>

              {genres.length > 0 && (
                <div className="det-genres">
                  {genres.map(g => <span key={g} className="genre-tag">{g}</span>)}
                </div>
              )}

              {/* Actions */}
              <div className="det-actions">
                {watched && resumeEp ? (
                  <>
                    <button className="btn-primary" onClick={() => goWatch(resumeEp)}>
                      <Ic n="play" s={15} /> Lanjutkan Ep {watched.epNum}
                    </button>
                    <button className="btn-secondary" onClick={() => firstEp && goWatch(firstEp)}>
                      <Ic n="play" s={14} /> Dari Awal
                    </button>
                  </>
                ) : (
                  <button className="btn-primary" onClick={() => firstEp && goWatch(firstEp)}
                    disabled={!firstEp}>
                    <Ic n="play" s={15} />
                    {firstEp ? "Mulai Tonton" : "Belum Ada Episode"}
                  </button>
                )}
                <button className={`btn-icon ${isFav ? "fav-active" : ""}`} onClick={handleFav}
                  title={isFav ? "Hapus dari favorit" : "Tambah ke favorit"}>
                  <Ic n="heart" s={17} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Sinopsis ── */}
      {sinopsis && (
        <div className="det-section">
          <h3 className="det-section-label">Sinopsis</h3>
          <p className="synopsis">{sinopsis}</p>
        </div>
      )}

      {/* ── Info Table ── */}
      {infoMap.length > 0 && (
        <div className="det-section">
          <h3 className="det-section-label">Informasi</h3>
          <div className="info-grid">
            {infoMap.map(([k, v]) => (
              <div key={k} className="info-cell">
                <span className="info-key">{k}</span>
                <span className={`info-val ${k === "Status" ? (isOngoing ? "text-green" : "text-dim") : ""}`}>
                  {String(v)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Episode List ── */}
      <div className="det-section">
        <h3 className="det-section-label">
          Daftar Episode
          {sortedEps.length > 0 && <span className="ep-count"> ({sortedEps.length})</span>}
        </h3>

        {sortedEps.length === 0 ? (
          <div className="empty-state small">
            <Ic n="film" s={36} />
            <p>Belum ada episode tersedia</p>
          </div>
        ) : (
          <>
            <div className="ep-grid">
              {displayEps.map(ep => {
                const isActive = watched?.epSlug === ep.slug;
                return (
                  <button key={ep.slug}
                    className={`ep-chip ${isActive ? "ep-active" : ""}`}
                    onClick={() => goWatch(ep)}
                    title={ep.subtitle || `Episode ${ep.episode}`}>
                    {isActive && <Ic n="play" s={10} />}
                    {ep.episode ? `Ep ${ep.episode}` : ep.subtitle || "?"}
                  </button>
                );
              })}
            </div>
            {sortedEps.length > 36 && (
              <button className="btn-secondary show-all-btn"
                onClick={() => setShowAll(s => !s)}>
                {showAll ? "Tampilkan Sedikit" : `Lihat Semua (${sortedEps.length} ep)`}
                <Ic n={showAll ? "chevD" : "chevR"} s={13} />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ─── WATCH PAGE ───────────────────────────────────────────────────────────────
const WatchPage = () => {
  const { epSlug: encodedSlug } = useParams();
  const location = useLocation();
  const nav      = useNavigate();
  const state    = location.state || {};

  const epSlug       = decodeURIComponent(encodedSlug);
  const { epNum: initNum, donghuaSlug, title, thumb, epList = [] } = state;

  const [epData,  setEpData]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState(null);
  const [curSlug, setCurSlug] = useState(epSlug);
  const [curNum,  setCurNum]  = useState(initNum);

  const sortedEps = [...epList].sort((a, b) =>
    (parseFloat(a.episode) || 0) - (parseFloat(b.episode) || 0)
  );
  const curIdx = sortedEps.findIndex(e => e.slug === curSlug);
  const prevEp = curIdx > 0 ? sortedEps[curIdx - 1] : null;
  const nextEp = curIdx < sortedEps.length - 1 ? sortedEps[curIdx + 1] : null;

  const loadEpisode = useCallback((slug, num) => {
    setLoading(true); setErr(null); setEpData(null);
    apiFetch(`/episode/${slug}`)
      .then(d => {
        setEpData(d);
        if (donghuaSlug) saveHistory(donghuaSlug, slug, num, title, thumb);
      })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [donghuaSlug, title, thumb]);

  useEffect(() => {
    loadEpisode(curSlug, curNum);
    window.history.replaceState(null, "", `/watch/${encodeURIComponent(curSlug)}`);
  }, [curSlug]);

  const navToEp = (ep) => { setCurSlug(ep.slug); setCurNum(ep.episode); };

  // Fallback iframe URL (OK.ru/Dailymotion dari /episode/)
  const iframeUrl = epData?.result?.players?.[0]?.url || "";

  return (
    <div className="watch-page">
      {/* Top bar */}
      <div className="watch-topbar">
        <button className="back-btn flat" onClick={() => nav(donghuaSlug ? `/detail/${donghuaSlug}` : "/")}>
          <Ic n="back" s={16} />
        </button>
        <div className="watch-meta" onClick={() => donghuaSlug && nav(`/detail/${donghuaSlug}`)}>
          <span className="watch-series">{title || "Anichin"}</span>
          <span className="watch-ep-label">Episode {curNum}</span>
        </div>
        <div className="watch-nav-btns">
          <button className="ep-nav-btn" onClick={() => prevEp && navToEp(prevEp)} disabled={!prevEp}>
            <Ic n="chevL" s={14} /> Prev
          </button>
          <button className="ep-nav-btn" onClick={() => nextEp && navToEp(nextEp)} disabled={!nextEp}>
            Next <Ic n="chevR" s={14} />
          </button>
        </div>
      </div>

      {/* Video */}
      <div className="video-wrap">
        {loading && (
          <div className="video-placeholder">
            <div className="spinner large" />
            <p>Memuat episode...</p>
          </div>
        )}
        {!loading && err && (
          <div className="video-placeholder">
            <Ic n="warn" s={44} />
            <p>{err}</p>
            <button className="btn-primary small" onClick={() => loadEpisode(curSlug, curNum)}>
              <Ic n="retry" s={14} /> Retry
            </button>
          </div>
        )}
        {!loading && !err && (
          <CustomPlayer
            key={curSlug}
            epSlug={curSlug}
            curNum={curNum}
            prevEp={prevEp}
            nextEp={nextEp}
            onNavEp={navToEp}
            sortedEps={sortedEps}
            curSlug={curSlug}
            iframeUrl={iframeUrl}
          />
        )}
      </div>
    </div>
  );
};

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const location = useLocation();
  const isWatch  = location.pathname.startsWith("/watch/");

  return (
    <div className="app">
      <style>{CSS}</style>
      {!isWatch && <Navbar />}
      <main className={isWatch ? "main-watch" : "main"}>
        <Routes>
          <Route path="/"                element={<HomePage />} />
          <Route path="/search/:query"   element={<SearchPage />} />
          <Route path="/genres"          element={<GenresPage />} />
          <Route path="/genre/:slug"     element={<GenreDetailPage />} />
          <Route path="/favorites"       element={<FavoritesPage />} />
          <Route path="/detail/:slug"    element={<DetailPage />} />
          <Route path="/watch/:epSlug"   element={<WatchPage />} />
          <Route path="*" element={
            <div className="empty-state" style={{ paddingTop: 120 }}>
              <Ic n="warn" s={48} />
              <p>Halaman tidak ditemukan</p>
              <Link to="/" className="btn-primary" style={{ textDecoration:"none" }}>Ke Home</Link>
            </div>
          } />
        </Routes>
      </main>
    </div>
  );
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Outfit:wght@300;400;500;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0d0d14; --bg2:#13131f; --bg3:#1a1a2e; --card:#16162a;
  --acc:#e94560; --acc2:#f5a623; --green:#4caf50;
  --t:#e8e8f0;   --t2:#8888a8; --border:#252540;
  --r:10px; --sh:0 6px 28px rgba(0,0,0,.6);
}
html{scroll-behavior:smooth}
body{background:var(--bg);color:var(--t);font-family:'Outfit',sans-serif;min-height:100vh}
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-track{background:var(--bg2)}
::-webkit-scrollbar-thumb{background:var(--acc);border-radius:2px}

/* APP */
.app{min-height:100vh;display:flex;flex-direction:column}
.main{flex:1;padding-top:64px;padding-bottom:56px}
.main-watch{flex:1;padding-top:0}

/* NAVBAR */
.navbar{
  position:fixed;top:0;left:0;right:0;z-index:200;height:64px;
  background:rgba(13,13,20,.97);backdrop-filter:blur(16px);
  border-bottom:1px solid var(--border);
  display:flex;align-items:center;gap:14px;padding:0 20px;
}
.nav-logo{font-family:'Bebas Neue',sans-serif;font-size:28px;letter-spacing:3px;cursor:pointer;flex-shrink:0}
.nav-logo span{color:var(--acc)}
.nav-search{display:flex;flex:1;max-width:380px;margin:0 auto;
  background:var(--bg3);border:1px solid var(--border);border-radius:8px;overflow:hidden;
  transition:border-color .2s}
.nav-search:focus-within{border-color:var(--acc)}
.search-input{flex:1;background:none;border:none;padding:9px 14px;color:var(--t);
  font-family:'Outfit',sans-serif;font-size:14px;outline:none}
.search-input::placeholder{color:var(--t2)}
.search-btn{padding:9px 13px;background:none;border:none;color:var(--t2);cursor:pointer;transition:color .2s}
.search-btn:hover{color:var(--acc)}
.nav-links{display:flex;gap:4px}
.nav-link{display:flex;align-items:center;gap:6px;padding:8px 12px;
  background:none;border:none;color:var(--t2);cursor:pointer;
  border-radius:8px;font-family:'Outfit',sans-serif;font-size:13px;transition:all .2s;white-space:nowrap}
.nav-link:hover{color:var(--t);background:var(--bg3)}
.nav-link.active{color:var(--acc);background:rgba(233,69,96,.12)}

/* PAGE */
.page{max-width:1400px;margin:0 auto;padding-bottom:48px}
.page-header{padding:28px 20px 8px}
.page-header h2{font-family:'Bebas Neue',sans-serif;font-size:24px;letter-spacing:2px}
.accent{color:var(--acc)}
.result-count{padding:8px 20px;color:var(--t2);font-size:13px}

/* HERO */
.hero{
  padding:52px 24px 44px;
  background:linear-gradient(135deg,#0d0d14 0%,#1a1a2e 50%,#0d0d14 100%);
  border-bottom:1px solid var(--border);position:relative;overflow:hidden;
}
.hero::after{
  content:'';position:absolute;top:-60px;right:-60px;
  width:400px;height:400px;
  background:radial-gradient(circle,rgba(233,69,96,.07) 0%,transparent 65%);
  pointer-events:none;
}
.hero-eyebrow{font-size:11px;color:var(--t2);letter-spacing:4px;text-transform:uppercase;margin-bottom:6px}
.hero-title{font-family:'Bebas Neue',sans-serif;font-size:clamp(54px,9vw,96px);
  line-height:1;letter-spacing:5px}
.hero-title span{color:var(--acc)}
.hero-sub{font-size:14px;color:var(--t2);margin-top:10px}

/* SECTIONS */
.section{padding:32px 20px 0}
.section-title{font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:2px;
  display:flex;align-items:center;gap:8px;margin-bottom:18px}
.accent-bar{color:var(--acc)}

/* CONTINUE WATCHING CAROUSEL */
.continue-carousel{
  display:flex;gap:14px;overflow-x:auto;padding:4px 20px 12px;
  scroll-snap-type:x mandatory;scrollbar-width:none;
}
.continue-carousel::-webkit-scrollbar{display:none}
.continue-card{
  flex-shrink:0;width:130px;cursor:pointer;
  scroll-snap-align:start;transition:transform .2s;
}
.continue-card:hover{transform:translateY(-4px)}
.continue-card-img{
  position:relative;aspect-ratio:2/3;border-radius:9px;overflow:hidden;background:var(--bg3);
}
.continue-card-img img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .3s}
.continue-card:hover .continue-card-img img{transform:scale(1.06)}
.continue-card-play{
  position:absolute;inset:0;background:rgba(0,0,0,.5);
  display:flex;align-items:center;justify-content:center;
  opacity:0;transition:opacity .2s;
}
.continue-card:hover .continue-card-play{opacity:1}
.continue-card-play svg{background:var(--acc);border-radius:50%;padding:8px;width:36px;height:36px}
.continue-card-title{
  font-size:11px;font-weight:500;margin-top:7px;line-height:1.4;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
}
.continue-card-ep{
  display:flex;align-items:center;gap:4px;
  font-size:11px;color:var(--acc);margin-top:3px;
}

/* CARDS GRID */
.cards-grid{
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(148px,1fr));
  gap:14px;padding:0 20px;
}

/* CARD */
.card{cursor:pointer;transition:transform .2s}
.card:hover{transform:translateY(-5px)}
.card-img{position:relative;aspect-ratio:2/3;border-radius:var(--r);overflow:hidden;background:var(--bg3)}
.card-img img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .3s}
.card:hover .card-img img{transform:scale(1.06)}
.card-overlay{
  position:absolute;inset:0;background:rgba(0,0,0,.55);
  display:flex;align-items:center;justify-content:center;
  opacity:0;transition:opacity .2s;
}
.card:hover .card-overlay{opacity:1}
.play-circle{width:44px;height:44px;background:var(--acc);border-radius:50%;
  display:flex;align-items:center;justify-content:center;color:#fff}
.card-badge{
  position:absolute;top:7px;left:7px;
  background:var(--acc);color:#fff;
  font-size:9px;padding:2px 7px;border-radius:4px;font-weight:700;
  text-transform:uppercase;letter-spacing:.5px;
}
.card-eps{
  position:absolute;bottom:7px;right:7px;
  background:rgba(0,0,0,.82);color:var(--acc2);
  font-size:10px;padding:2px 7px;border-radius:4px;
}
.card-watched{
  position:absolute;bottom:0;left:0;right:0;
  background:rgba(233,69,96,.88);padding:4px 8px;
  font-size:10px;font-weight:600;text-align:center;
}
.card-title{font-size:12px;font-weight:500;line-height:1.4;margin-top:7px;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}

/* GENRES */
.genres-grid{display:flex;flex-wrap:wrap;gap:9px;padding:18px 20px}
.genre-chip{
  display:flex;align-items:center;gap:6px;padding:9px 16px;
  background:var(--card);border:1px solid var(--border);color:var(--t2);
  border-radius:8px;cursor:pointer;font-family:'Outfit',sans-serif;font-size:13px;transition:all .2s;
}
.genre-chip:hover{border-color:var(--acc);color:var(--acc);background:rgba(233,69,96,.06)}

/* SKELETON */
.ske{
  background:linear-gradient(90deg,var(--bg3) 25%,var(--bg2) 50%,var(--bg3) 75%);
  background-size:200% 100%;animation:shim 1.4s infinite;border-radius:8px;
}
@keyframes shim{0%{background-position:-200% 0}100%{background-position:200% 0}}

/* SPINNER */
.spinner-wrap{display:flex;flex-direction:column;align-items:center;gap:14px;padding:60px 20px;color:var(--t2)}
.spinner{width:36px;height:36px;border:3px solid var(--border);
  border-top-color:var(--acc);border-radius:50%;animation:sp .8s linear infinite}
.spinner.large{width:48px;height:48px;border-width:4px}
@keyframes sp{to{transform:rotate(360deg)}}

/* ERROR / EMPTY */
.err-box,.empty-state{
  display:flex;flex-direction:column;align-items:center;
  gap:14px;padding:60px 20px;color:var(--t2);text-align:center;
}
.err-box svg{color:var(--acc)}
.empty-state.small{padding:32px 20px}
.empty-state svg{opacity:.4}

/* BUTTONS */
.btn-primary{
  display:flex;align-items:center;gap:8px;padding:11px 22px;
  background:var(--acc);color:#fff;border:none;border-radius:9px;
  cursor:pointer;font-family:'Outfit',sans-serif;font-size:14px;font-weight:600;transition:all .2s;
}
.btn-primary:hover:not(:disabled){background:#d53050;transform:translateY(-1px)}
.btn-primary:disabled{opacity:.4;cursor:not-allowed}
.btn-primary.small{padding:8px 16px;font-size:13px}
.btn-secondary{
  display:flex;align-items:center;gap:8px;padding:11px 18px;
  background:var(--bg3);color:var(--t);border:1px solid var(--border);border-radius:9px;
  cursor:pointer;font-family:'Outfit',sans-serif;font-size:13px;transition:all .2s;
}
.btn-secondary:hover{border-color:var(--acc);color:var(--acc)}
.btn-icon{
  display:flex;align-items:center;justify-content:center;
  width:44px;height:44px;background:var(--bg3);
  border:1px solid var(--border);border-radius:9px;
  cursor:pointer;color:var(--t2);transition:all .2s;flex-shrink:0;
}
.btn-icon:hover{border-color:var(--acc);color:var(--acc)}
.fav-active{color:var(--acc);border-color:var(--acc);background:rgba(233,69,96,.1)}
.back-btn{
  display:flex;align-items:center;gap:7px;padding:8px 16px;
  background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.15);color:var(--t);
  border-radius:8px;cursor:pointer;font-family:'Outfit',sans-serif;font-size:13px;transition:all .2s;
}
.back-btn:hover{border-color:var(--acc);color:var(--acc)}
.back-btn.flat{background:transparent;border:none;color:var(--t2);padding:8px}
.back-btn.flat:hover{color:var(--acc)}
.show-all-btn{margin-top:12px}

/* PAGINATION */
.pagination{display:flex;align-items:center;justify-content:center;gap:16px;padding:32px 20px}
.page-btn{
  display:flex;align-items:center;gap:6px;padding:10px 20px;
  background:var(--bg3);border:1px solid var(--border);color:var(--t);
  border-radius:8px;cursor:pointer;font-family:'Outfit',sans-serif;font-size:13px;transition:all .2s;
}
.page-btn:hover:not(:disabled){border-color:var(--acc);color:var(--acc)}
.page-btn:disabled{opacity:.35;cursor:not-allowed}
.page-num{font-size:13px;color:var(--t2)}

/* ── DETAIL ── */
.det-hero{
  position:relative;min-height:440px;display:flex;align-items:flex-end;overflow:hidden;
}
.det-hero-blur{
  position:absolute;inset:0;
  background-image:var(--thumb);
  background-size:cover;background-position:center top;
  filter:blur(24px) saturate(.4) brightness(.6);
  transform:scale(1.07);
}
.det-hero-blur::after{
  content:'';position:absolute;inset:0;
  background:linear-gradient(to bottom,rgba(13,13,20,.2) 0%,rgba(13,13,20,.98) 90%);
}
.det-hero-content{position:relative;z-index:1;width:100%;padding:22px}
.det-layout{display:flex;gap:22px;margin-top:20px;flex-wrap:wrap}
.det-poster{
  width:158px;flex-shrink:0;border-radius:12px;
  object-fit:cover;aspect-ratio:2/3;
  box-shadow:var(--sh);background:var(--bg3);
}
.det-info{flex:1;display:flex;flex-direction:column;gap:12px;min-width:220px}
.det-badges{display:flex;flex-wrap:wrap;gap:6px}
.badge{padding:3px 9px;border-radius:4px;font-size:10px;font-weight:700;
  text-transform:uppercase;letter-spacing:.8px}
.badge-type{background:rgba(233,69,96,.15);color:var(--acc);border:1px solid rgba(233,69,96,.3)}
.badge-on{background:rgba(76,175,80,.14);color:#4caf50;border:1px solid rgba(76,175,80,.3)}
.badge-done{background:rgba(136,136,168,.1);color:var(--t2);border:1px solid var(--border)}
.badge-score{background:rgba(245,166,35,.12);color:var(--acc2);border:1px solid rgba(245,166,35,.3);
  display:flex;align-items:center;gap:4px}
.det-title{font-family:'Bebas Neue',sans-serif;font-size:clamp(24px,5vw,40px);
  letter-spacing:2px;line-height:1.05}
.det-stats{display:flex;flex-wrap:wrap;gap:14px}
.det-stats span{display:flex;align-items:center;gap:5px;font-size:12px;color:var(--t2)}
.det-genres{display:flex;flex-wrap:wrap;gap:6px}
.genre-tag{padding:3px 10px;background:var(--bg3);border:1px solid var(--border);
  border-radius:5px;font-size:11px;color:var(--t2)}
.det-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:4px}

.det-section{padding:26px 20px 0}
.det-section-label{font-size:11px;font-weight:700;color:var(--t2);
  text-transform:uppercase;letter-spacing:2px;margin-bottom:14px;display:flex;align-items:center;gap:8px}
.ep-count{font-size:13px;color:var(--t2);font-weight:400;letter-spacing:0;text-transform:none}
.synopsis{font-size:14px;line-height:1.9;color:var(--t2);white-space:pre-line}

.info-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px}
.info-cell{display:flex;gap:12px;background:var(--card);border-radius:8px;
  padding:10px 14px;border:1px solid var(--border)}
.info-key{font-size:11px;color:var(--t2);min-width:90px;flex-shrink:0;padding-top:1px}
.info-val{font-size:13px;color:var(--t);font-weight:500}
.text-green{color:var(--green)!important}
.text-dim{color:var(--t2)!important}

.ep-grid{display:flex;flex-wrap:wrap;gap:7px}
.ep-chip{
  padding:8px 13px;background:var(--card);border:1px solid var(--border);
  border-radius:7px;color:var(--t2);cursor:pointer;
  font-family:'Outfit',sans-serif;font-size:12px;transition:all .2s;
  display:flex;align-items:center;gap:5px;
}
.ep-chip:hover{border-color:var(--acc);color:var(--t)}
.ep-active{background:rgba(233,69,96,.15);border-color:var(--acc);color:var(--acc)}

/* ── WATCH ── */
.watch-page{display:flex;flex-direction:column;min-height:100vh;background:var(--bg)}
.watch-topbar{
  display:flex;align-items:center;gap:10px;padding:10px 14px;
  background:var(--bg2);border-bottom:1px solid var(--border);
  position:sticky;top:0;z-index:100;
}
.watch-meta{flex:1;cursor:pointer;min-width:0;overflow:hidden}
.watch-series{font-size:14px;color:var(--acc);font-weight:600;display:block;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.watch-series:hover{text-decoration:underline}
.watch-ep-label{font-size:11px;color:var(--t2)}
.watch-nav-btns{display:flex;gap:6px}
.ep-nav-btn{
  display:flex;align-items:center;gap:4px;padding:7px 12px;
  background:var(--bg3);border:1px solid var(--border);color:var(--t2);
  border-radius:7px;cursor:pointer;font-family:'Outfit',sans-serif;font-size:12px;transition:all .2s;
}
.ep-nav-btn:hover:not(:disabled){border-color:var(--acc);color:var(--acc)}
.ep-nav-btn:disabled{opacity:.3;cursor:not-allowed}

.video-wrap{width:100%;aspect-ratio:16/9;background:#000;position:relative;overflow:hidden}
.video-iframe{width:100%;height:100%;border:none;display:block}
.video-placeholder{
  position:absolute;inset:0;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:14px;
  color:var(--t2);text-align:center;padding:0 24px;
}
.video-placeholder svg{opacity:.5}

/* ── CUSTOM PLAYER ── */
.cp-wrap{
  position:relative;width:100%;height:100%;background:#000;
}
.cp-video{width:100%;height:100%;display:block;object-fit:contain}

/* Plyr theme override — dark accent */
.cp-wrap .plyr--video .plyr__control--overlaid{background:var(--acc)}
.cp-wrap .plyr--full-ui input[type=range]{color:var(--acc)}
.cp-wrap .plyr__control:hover{background:var(--acc)!important}
.cp-wrap .plyr__menu__container .plyr__control[role=menuitemradio][aria-checked=true]::before{background:var(--acc)}

/* overlay tombol custom — terletak di atas plyr controls */
.cp-overlay{
  position:absolute;top:0;left:0;right:0;bottom:54px; /* 54px = tinggi plyr controls */
  pointer-events:none;
  opacity:0;transition:opacity .25s;
}
.cp-overlay--ready{opacity:1}
.cp-wrap:hover .cp-overlay{pointer-events:auto}

/* seek buttons — kiri & kanan tengah */
.cp-seek-btn{
  position:absolute;top:50%;transform:translateY(-50%);
  background:rgba(0,0,0,.55);border:none;color:#fff;
  width:52px;height:52px;border-radius:50%;cursor:pointer;
  display:flex;align-items:center;justify-content:center;
  pointer-events:auto;transition:background .2s;padding:0;
}
.cp-seek-btn svg{width:26px;height:26px}
.cp-seek-btn:hover{background:rgba(233,69,96,.7)}
.cp-seek-left{left:18%}
.cp-seek-right{right:18%}

/* episode list button — pojok kanan atas */
.cp-ep-list-btn{
  position:absolute;top:12px;right:12px;
  display:flex;align-items:center;gap:6px;
  background:rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.15);
  color:#fff;border-radius:8px;padding:7px 13px;cursor:pointer;
  font-family:'Outfit',sans-serif;font-size:12px;font-weight:600;
  pointer-events:auto;transition:background .2s;backdrop-filter:blur(6px);
}
.cp-ep-list-btn svg{width:16px;height:16px}
.cp-ep-list-btn:hover{background:rgba(233,69,96,.7)}

/* prev/next episode — pojok kiri atas */
.cp-ep-nav{
  position:absolute;top:12px;left:12px;
  display:flex;gap:6px;pointer-events:auto;
}
.cp-ep-nav-btn{
  display:flex;align-items:center;gap:4px;
  background:rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.15);
  color:#fff;border-radius:8px;padding:7px 12px;cursor:pointer;
  font-family:'Outfit',sans-serif;font-size:12px;font-weight:600;
  transition:background .2s;backdrop-filter:blur(6px);
}
.cp-ep-nav-btn svg{width:14px;height:14px}
.cp-ep-nav-btn:hover:not(:disabled){background:rgba(233,69,96,.7)}
.cp-ep-nav-btn:disabled{opacity:.35;cursor:not-allowed}

/* quality selector — pojok kiri bawah di atas controls */
.cp-quality{
  position:absolute;bottom:62px;left:12px;
  display:flex;gap:5px;pointer-events:auto;
}
.cp-quality-btn{
  padding:5px 10px;background:rgba(0,0,0,.65);
  border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.75);
  border-radius:6px;cursor:pointer;font-family:'Outfit',sans-serif;
  font-size:11px;font-weight:600;transition:all .2s;backdrop-filter:blur(6px);
}
.cp-quality-btn:hover{border-color:var(--acc);color:#fff}
.cp-quality-btn.active{background:var(--acc);border-color:var(--acc);color:#fff}

/* episode panel slide-in dari kanan */
.cp-ep-panel{
  position:absolute;top:0;right:0;bottom:0;width:260px;
  background:rgba(13,13,20,.96);backdrop-filter:blur(16px);
  border-left:1px solid rgba(255,255,255,.08);
  display:flex;flex-direction:column;
  transform:translateX(100%);transition:transform .28s cubic-bezier(.4,0,.2,1);
  z-index:50;
}
.cp-ep-panel.open{transform:translateX(0)}
.cp-ep-panel-header{
  display:flex;align-items:center;justify-content:space-between;
  padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.07);
  font-size:13px;font-weight:700;color:#fff;letter-spacing:.5px;flex-shrink:0;
}
.cp-ep-panel-close{
  background:none;border:none;color:rgba(255,255,255,.5);cursor:pointer;
  font-size:16px;line-height:1;padding:2px 6px;border-radius:4px;transition:color .2s;
}
.cp-ep-panel-close:hover{color:#fff}
.cp-ep-panel-list{
  flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:4px;
}
.cp-ep-panel-list::-webkit-scrollbar{width:3px}
.cp-ep-panel-list::-webkit-scrollbar-thumb{background:var(--acc);border-radius:2px}
.cp-ep-item{
  display:flex;flex-direction:column;align-items:flex-start;gap:2px;
  padding:9px 12px;background:rgba(255,255,255,.04);
  border:1px solid transparent;border-radius:8px;cursor:pointer;
  font-family:'Outfit',sans-serif;transition:all .18s;text-align:left;
}
.cp-ep-item:hover{background:rgba(233,69,96,.12);border-color:rgba(233,69,96,.3)}
.cp-ep-item.active{background:rgba(233,69,96,.2);border-color:var(--acc)}
.cp-ep-num{font-size:12px;font-weight:700;color:#fff}
.cp-ep-item.active .cp-ep-num{color:var(--acc)}
.cp-ep-sub{font-size:10px;color:rgba(255,255,255,.45);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}

/* Fullscreen: panel & overlay tetap tampil */
:fullscreen .cp-ep-panel,:fullscreen .cp-overlay,
:-webkit-full-screen .cp-ep-panel,:-webkit-full-screen .cp-overlay{display:flex}
:fullscreen .cp-wrap,:-webkit-full-screen .cp-wrap{height:100vh}

/* Mobile */
@media(max-width:480px){
  .cp-seek-left{left:8%}
  .cp-seek-right{right:8%}
  .cp-ep-panel{width:200px}
  .cp-ep-nav-btn span{display:none}
}

/* RESPONSIVE */
@media(max-width:640px){
  .navbar{padding:0 10px;gap:8px}
  .nav-links span{display:none}
  .nav-link{padding:8px}
  .nav-search{max-width:150px}
  .cards-grid{grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;padding:0 12px}
  .section{padding:22px 12px 0}
  .det-poster{width:120px}
  .info-grid{grid-template-columns:1fr}
  .watch-topbar{flex-wrap:wrap}
}
`;
