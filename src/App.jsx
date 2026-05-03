import { useState, useEffect, useCallback, useRef } from "react";
import { Routes, Route, useNavigate, useParams, Link, useLocation } from "react-router-dom";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
// Di Vercel: REACT_APP_API_BASE=/api/proxy  → semua request lewat proxy serverless
// Dev local: REACT_APP_API_BASE=http://localhost:5000
const API_RAW = process.env.REACT_APP_API_BASE || "/api/proxy";
const USE_PROXY = API_RAW.startsWith("/api/proxy") || API_RAW === "/api/proxy";

// Build URL — kalau pakai proxy, path jadi query param
const buildUrl = (path) => {
  if (USE_PROXY) return `/api/proxy?path=${encodeURIComponent(path)}`;
  return `${API_RAW}${path}`;
};

const toDonghuaSlug = (slug) =>
  slug.replace(/-episode-\d[\w-]*$/i, "").replace(/-subtitle-[\w-]*$/i, "");

// ─── CLIENT-SIDE CACHE ────────────────────────────────────────────────────────
// In-memory cache — tidak kelihatan di network tab sama sekali
const memCache = new Map();
const MEM_TTL = {
  home:    30 * 60 * 1000,   // 30 menit
  detail:  60 * 60 * 1000,   // 1 jam
  episode: 60 * 60 * 1000,   // 1 jam
  search:  15 * 60 * 1000,   // 15 menit
  genres:  24 * 60 * 60 * 1000, // 24 jam
};

const memGet = (key) => {
  const entry = memCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.exp) { memCache.delete(key); return null; }
  return entry.data;
};
const memSet = (key, data, type = "home") => {
  memCache.set(key, { data, exp: Date.now() + (MEM_TTL[type] || MEM_TTL.home) });
};

// ─── FETCH ────────────────────────────────────────────────────────────────────
const apiFetch = async (path, cacheType = "home") => {
  const cacheKey = path;
  const cached = memGet(cacheKey);
  if (cached) return cached;

  const res = await fetch(buildUrl(path));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  memSet(cacheKey, data, cacheType);
  return data;
};

// ─── STORAGE ──────────────────────────────────────────────────────────────────
const ls = {
  get: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const getHistory  = ()   => ls.get("ach_history") || {};
const getFavs     = ()   => ls.get("ach_favs")    || {};
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
  bell:    "M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0",
  fire:    "M12 2c0 0-5.5 3.5-5.5 9 0 2.5 1.5 4.5 3.5 5.5-.5-1.5 0-3 1-4 1 2 3.5 3 5 5.5 0-4 2-6 2-9C18 5.5 12 2 12 2z",
  grid:    "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  x:       "M18 6L6 18M6 6l12 12",
};
const Ic = ({ n, s = 20, className = "" }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d={P[n]} />
  </svg>
);

// ─── TOAST ────────────────────────────────────────────────────────────────────
let _toastFn = null;
const useToast = () => {
  const [toasts, setToasts] = useState([]);
  _toastFn = useCallback((msg, type = "info") => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
  }, []);
  return toasts;
};
const toast = (msg, type) => _toastFn && _toastFn(msg, type);

const ToastContainer = ({ toasts }) => (
  <div className="toast-container">
    {toasts.map(t => (
      <div key={t.id} className={`toast toast-${t.type}`}>{t.msg}</div>
    ))}
  </div>
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

// Skeleton shimmer untuk loading cards
const SkeletonCard = () => (
  <div className="skeleton-card">
    <div className="ske ske-img" />
    <div className="ske ske-text" style={{ width: "80%", marginTop: 8 }} />
    <div className="ske ske-text" style={{ width: "50%", marginTop: 6 }} />
  </div>
);

const SkeletonGrid = ({ count = 12 }) => (
  <div className="cards-grid">
    {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}
  </div>
);

// ─── CARD ─────────────────────────────────────────────────────────────────────
const DonghuaCard = ({ item, rank }) => {
  const nav        = useNavigate();
  const history    = getHistory();
  const donghuaSlug = toDonghuaSlug(item.slug);
  const watched    = history[donghuaSlug];
  return (
    <div className="card" onClick={() => nav(`/detail/${toDonghuaSlug(item.slug)}`)}>
      {rank && <div className="card-rank">#{rank}</div>}
      <div className="card-img">
        <img src={item.thumbnail || IMG_FB} alt={item.title}
          onError={e => { e.target.src = IMG_FB; }}
          loading="lazy" />
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

// ─── SCROLL PROGRESS ──────────────────────────────────────────────────────────
const ScrollProgress = () => {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement;
      const pct = (doc.scrollTop / (doc.scrollHeight - doc.clientHeight)) * 100;
      setProgress(isNaN(pct) ? 0 : pct);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return <div className="scroll-progress" style={{ width: `${progress}%` }} />;
};

// ─── NAVBAR ───────────────────────────────────────────────────────────────────
const Navbar = () => {
  const nav      = useNavigate();
  const location = useLocation();
  const [q, setQ]       = useState("");
  const [open, setOpen] = useState(false);

  const onSearch = (e) => {
    e.preventDefault();
    if (q.trim()) { nav(`/search/${encodeURIComponent(q.trim())}`); setQ(""); setOpen(false); }
  };

  const links = [
    { to: "/",          icon: "home",  label: "Home"   },
    { to: "/genres",    icon: "tag",   label: "Genre"  },
    { to: "/favorites", icon: "heart", label: "Favorit" },
  ];

  return (
    <nav className="navbar">
      <ScrollProgress />
      <div className="nav-logo" onClick={() => nav("/")}>
        ANI<span>CHIN</span><span className="logo-dot">.</span>
      </div>

      {/* Desktop search */}
      <form className="nav-search" onSubmit={onSearch}>
        <Ic n="search" s={14} className="search-icon-left" />
        <input value={q} onChange={e => setQ(e.target.value)}
          placeholder="Cari donghua..." className="search-input" />
        <button type="submit" className="search-btn">Cari</button>
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

      {/* Mobile search toggle */}
      <button className="mobile-search-btn" onClick={() => setOpen(o => !o)}>
        <Ic n={open ? "x" : "search"} s={18} />
      </button>

      {open && (
        <form className="mobile-search-bar" onSubmit={onSearch}>
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="Cari donghua..." className="search-input" autoFocus />
          <button type="submit" className="search-btn">Cari</button>
        </form>
      )}
    </nav>
  );
};

// ─── HOME PAGE ────────────────────────────────────────────────────────────────
const HomePage = () => {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState(null);
  const [page,    setPage]    = useState(1);
  const nav     = useNavigate();
  const history = getHistory();

  const load = useCallback(() => {
    setLoading(true); setErr(null);
    apiFetch(`/?page=${page}`, "home")
      .then(setData)
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const histItems = Object.entries(history)
    .sort(([, a], [, b]) => b.at - a.at)
    .slice(0, 8);

  // Ambil section pertama sebagai "trending" (biasanya popular/terbaru)
  const trending = data?.results?.[0]?.cards?.slice(0, 6) || [];

  return (
    <div className="page">
      {/* Hero */}
      <div className="hero">
        <div className="hero-noise" />
        <div className="hero-glow" />
        <div className="hero-content">
          <div className="hero-badge"><Ic n="fire" s={13} /> Streaming Donghua</div>
          <h1 className="hero-title">ANI<span>CHIN</span><span className="hero-dot">.</span></h1>
          <p className="hero-sub">Sub Indo terlengkap & terupdate</p>
          {trending.length > 0 && (
            <div className="hero-trending">
              <span className="hero-trending-label">Trending:</span>
              {trending.slice(0, 3).map(item => (
                <button key={item.slug} className="hero-trending-chip"
                  onClick={() => nav(`/detail/${toDonghuaSlug(item.slug)}`)}>
                  {item.title}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Continue Watching */}
      {histItems.length > 0 && (
        <section className="section">
          <h2 className="section-title">
            <span className="accent-bar">▍</span>Lanjutkan Menonton
            <span className="section-count">{histItems.length}</span>
          </h2>
          <div className="continue-carousel">
            {histItems.map(([slug, h]) => (
              <div key={slug} className="continue-card"
                onClick={() => nav(`/detail/${toDonghuaSlug(slug)}`)}>
                <div className="continue-card-img">
                  <img src={h.thumbnail || IMG_FB} alt={h.title}
                    onError={e => e.target.src = IMG_FB} loading="lazy" />
                  <div className="continue-card-play"><Ic n="play" s={16} /></div>
                  <div className="continue-card-ep-badge">Ep {h.epNum}</div>
                </div>
                <p className="continue-card-title">{h.title}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {loading && (
        <section className="section">
          <SkeletonGrid count={12} />
        </section>
      )}
      {err && <ErrBox msg={err} onRetry={load} />}

      {data?.results
        ?.filter(sec => !sec.section.toLowerCase().includes("blog"))
        .map((sec, idx) => (
          <section key={sec.section} className="section">
            <h2 className="section-title">
              <span className="accent-bar">▍</span>
              {sec.section.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
              <span className="section-count">{sec.cards?.length || 0}</span>
            </h2>
            <div className="cards-grid">
              {sec.cards.map((item, i) => (
                <DonghuaCard key={item.slug} item={item} rank={idx === 0 ? i + 1 : null} />
              ))}
            </div>
          </section>
        ))}

      <div className="pagination">
        <button className="page-btn" disabled={page <= 1}
          onClick={() => { setPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
          <Ic n="chevL" s={14} /> Prev
        </button>
        <span className="page-num">Halaman {page}</span>
        <button className="page-btn"
          onClick={() => { setPage(p => p + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
          Next <Ic n="chevR" s={14} />
        </button>
      </div>
    </div>
  );
};

// ─── SEARCH PAGE ──────────────────────────────────────────────────────────────
const SearchPage = () => {
  const { query }            = useParams();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState(null);

  useEffect(() => {
    if (!query) return;
    setLoading(true); setErr(null); setData(null);
    apiFetch(`/search/${query}`, "search")
      .then(setData)
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [query]);

  return (
    <div className="page">
      <div className="page-header">
        <h2>Hasil: <span className="accent">"{decodeURIComponent(query)}"</span></h2>
      </div>
      {loading && <SkeletonGrid count={8} />}
      {err && <ErrBox msg={err} />}
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
    apiFetch("/genres", "genres")
      .then(d => setGenres(d.genres || []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;

  return (
    <div className="page">
      <div className="page-header">
        <h2>Genre Donghua</h2>
        <span className="section-count">{genres.length}</span>
      </div>
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
    apiFetch(`/genre/${slug}?page=${page}`, "genre")
      .then(setData)
      .finally(() => setLoading(false));
  }, [slug, page]);

  return (
    <div className="page">
      <div className="page-header">
        <h2>Genre: <span className="accent">{genreName}</span></h2>
      </div>
      {loading && <SkeletonGrid count={12} />}
      {data && <div className="cards-grid">{data.results?.map(i => <DonghuaCard key={i.slug} item={i} />)}</div>}
      <div className="pagination">
        <button className="page-btn" disabled={page <= 1}
          onClick={() => { setPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
          <Ic n="chevL" s={14} /> Prev
        </button>
        <span className="page-num">Hal {page}</span>
        <button className="page-btn"
          onClick={() => { setPage(p => p + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
          Next <Ic n="chevR" s={14} />
        </button>
      </div>
    </div>
  );
};

// ─── FAVORITES PAGE ───────────────────────────────────────────────────────────
const FavoritesPage = () => {
  const [favs, setFavs] = useState(getFavs());
  const items = Object.values(favs);

  const clearAll = () => {
    ls.set("ach_favs", {});
    setFavs({});
    toast("Favorit dihapus semua", "info");
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>Favorit Saya</h2>
        {items.length > 0 && (
          <button className="btn-secondary" onClick={clearAll} style={{ fontSize: 12, padding: "6px 12px" }}>
            Hapus Semua
          </button>
        )}
      </div>
      {!items.length
        ? <div className="empty-state"><Ic n="heart" s={48} /><p>Belum ada favorit</p></div>
        : <div className="cards-grid">{items.map(i => <DonghuaCard key={i.slug} item={i} />)}</div>
      }
    </div>
  );
};

// ─── DETAIL PAGE ──────────────────────────────────────────────────────────────
const DetailPage = () => {
  const { slug } = useParams();
  const nav      = useNavigate();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState(null);
  const [isFav,   setIsFav]   = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [epSearch, setEpSearch] = useState("");

  const load = useCallback(() => {
    setLoading(true); setErr(null);
    apiFetch(`/${slug}`, "detail")
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
  const title    = r.name       || "Unknown Title";
  const thumb    = r.thumbnail  || IMG_FB;
  const genres   = r.genre      || [];
  const rating   = r.rating;
  const episodes = r.episode    || [];
  const sinopsis = (() => {
    if (!r.sinopsis) return "";
    if (typeof r.sinopsis === "string") return r.sinopsis;
    if (r.sinopsis.paragraphs?.length) return r.sinopsis.paragraphs.filter(Boolean).join("\n\n");
    return "";
  })();

  const status   = r.status || r.Status;
  const totalEps = r.jumlah_episode || r.total_episode || r["total episode"] || (episodes.length > 0 ? episodes.length : null);
  const isOngoing = status && /ongoing|berlangsung|airing/i.test(status);

  const sortedEps = [...episodes].sort((a, b) =>
    (parseFloat(a.episode) || 0) - (parseFloat(b.episode) || 0)
  );

  const filteredEps = epSearch
    ? sortedEps.filter(e => String(e.episode).includes(epSearch))
    : sortedEps;

  const history = getHistory();
  const watched = history[slug];
  const firstEp = sortedEps[0];
  const resumeEp = watched
    ? (sortedEps.find(e => e.slug === watched.epSlug) || sortedEps[sortedEps.length - 1])
    : null;

  const handleFav = () => {
    const newState = toggleFav(slug, { slug, title, thumbnail: thumb, type: r.tipe || r.type, eps: totalEps });
    setIsFav(newState);
    toast(newState ? "Ditambahkan ke favorit ❤️" : "Dihapus dari favorit", newState ? "success" : "info");
  };

  const goWatch = (ep) => {
    nav(`/watch/${encodeURIComponent(ep.slug)}`, {
      state: { epNum: ep.episode, donghuaSlug: slug, title, thumb, epList: sortedEps }
    });
  };

  const displayEps = showAll ? filteredEps : filteredEps.slice(0, 48);

  const infoMap = [
    ["Status",        status],
    ["Total Episode", totalEps],
    ["Studio",        r.studio || r.Studio],
    ["Tipe",          r.tipe || r.type || r.Tipe],
    ["Tayang",        r.tanggal_rilis || r.released || r["tanggal tayang"] || r["tanggal_tayang"]],
    ["Season",        r.season || r.Season],
    ["Durasi",        r.durasi || r.duration],
    ["Negara",        r.negara || r.country],
    ["Sutradara",     r.sutradara || r.director],
    ["Skor",          r.skor || rating],
  ].filter(([, v]) => v);

  return (
    <div className="page">
      {/* Hero */}
      <div className="det-hero" style={{ "--thumb": `url(${thumb})` }}>
        <div className="det-hero-blur" />
        <div className="det-hero-content">
          <button className="back-btn" onClick={() => nav(-1)}>
            <Ic n="back" s={16} /> Kembali
          </button>
          <div className="det-layout">
            <div className="det-poster-wrap">
              <img src={thumb} alt={title} className="det-poster"
                onError={e => { e.target.src = IMG_FB; }} />
              {(r.skor || rating) && (
                <div className="det-score-badge">
                  <Ic n="star" s={12} /> {r.skor || rating}
                </div>
              )}
            </div>
            <div className="det-info">
              <div className="det-badges">
                {(r.tipe || r.type) && <span className="badge badge-type">{r.tipe || r.type}</span>}
                {status && (
                  <span className={`badge ${isOngoing ? "badge-on" : "badge-done"}`}>
                    {isOngoing ? "🟢 " : "✅ "}{status}
                  </span>
                )}
              </div>
              <h1 className="det-title">{title}</h1>
              <div className="det-stats">
                {totalEps && <span><Ic n="list" s={13} /> {totalEps} Episode</span>}
                {(r.tanggal_rilis || r.released) && <span><Ic n="clock" s={13} /> {r.tanggal_rilis || r.released}</span>}
                {(r.durasi || r.duration) && <span>⏱ {r.durasi || r.duration}</span>}
                {(r.season || r.Season) && <span>📅 {r.season || r.Season}</span>}
              </div>
              {genres.length > 0 && (
                <div className="det-genres">
                  {genres.map(g => <span key={g} className="genre-tag">{g}</span>)}
                </div>
              )}
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
                  <button className="btn-primary" onClick={() => firstEp && goWatch(firstEp)} disabled={!firstEp}>
                    <Ic n="play" s={15} /> {firstEp ? "Mulai Tonton" : "Belum Ada Episode"}
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

      {sinopsis && (
        <div className="det-section">
          <h3 className="det-section-label">Sinopsis</h3>
          <p className="synopsis">{sinopsis}</p>
        </div>
      )}

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

      {/* Episode List */}
      <div className="det-section">
        <h3 className="det-section-label">
          Daftar Episode
          {sortedEps.length > 0 && <span className="ep-count"> ({sortedEps.length})</span>}
        </h3>
        {sortedEps.length > 12 && (
          <input
            className="ep-search"
            placeholder="Cari episode..."
            value={epSearch}
            onChange={e => setEpSearch(e.target.value)}
          />
        )}
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
            {filteredEps.length > 48 && (
              <button className="btn-secondary show-all-btn" onClick={() => setShowAll(s => !s)}>
                {showAll ? "Tampilkan Sedikit" : `Lihat Semua (${filteredEps.length} ep)`}
                <Ic n={showAll ? "chevD" : "chevR"} s={13} />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ─── VIDEO EMBED ──────────────────────────────────────────────────────────────
function VideoEmbed({ url, title }) {
  const videoRef = useRef(null);
  const hlsRef   = useRef(null);
  const isDirectVideo = url && /\.(mp4|webm|ogg)(\?.*)?$/i.test(url);
  const isHLS         = url && /\.m3u8(\?.*)?$/i.test(url);

  useEffect(() => {
    if (!isHLS || !videoRef.current) return;
    let hls;
    const initHLS = (Hls) => {
      if (Hls.isSupported()) {
        hls = new Hls();
        hlsRef.current = hls;
        hls.loadSource(url);
        hls.attachMedia(videoRef.current);
      } else if (videoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
        videoRef.current.src = url;
      }
    };
    if (window.Hls) {
      initHLS(window.Hls);
    } else {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/hls.js@latest/dist/hls.min.js";
      script.onload = () => initHLS(window.Hls);
      document.head.appendChild(script);
    }
    return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; } };
  }, [url, isHLS]);

  if (!url) return null;
  if (isDirectVideo) return (
    <video className="video-iframe" controls autoPlay playsInline title={title} key={url}>
      <source src={url} />
    </video>
  );
  if (isHLS) return (
    <video ref={videoRef} className="video-iframe" controls autoPlay playsInline title={title} key={url} />
  );
  return (
    <iframe src={url} className="video-iframe" allowFullScreen
      allow="autoplay; fullscreen; picture-in-picture" title={title} key={url} />
  );
}

// ─── WATCH PAGE ───────────────────────────────────────────────────────────────
const WatchPage = () => {
  const { epSlug: encodedSlug } = useParams();
  const location = useLocation();
  const nav      = useNavigate();
  const state    = location.state || {};

  const epSlug = decodeURIComponent(encodedSlug);
  const { epNum: initNum, donghuaSlug, title, thumb, epList = [] } = state;

  const [epData,  setEpData]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState(null);
  const [curSlug, setCurSlug] = useState(epSlug);
  const [curNum,  setCurNum]  = useState(initNum);
  const [player,  setPlayer]  = useState(null);

  const sortedEps = [...epList].sort((a, b) =>
    (parseFloat(a.episode) || 0) - (parseFloat(b.episode) || 0)
  );
  const curIdx = sortedEps.findIndex(e => e.slug === curSlug);
  const prevEp = curIdx > 0 ? sortedEps[curIdx - 1] : null;
  const nextEp = curIdx < sortedEps.length - 1 ? sortedEps[curIdx + 1] : null;

  const loadEpisode = useCallback((slug, num) => {
    setLoading(true); setErr(null); setEpData(null); setPlayer(null);
    apiFetch(`/episode/${slug}`, "episode")
      .then(d => {
        setEpData(d);
        const players = d?.result?.players || [];
        if (players.length) setPlayer(players[0]);
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

  const players  = epData?.result?.players || [];
  const videoUrl = player?.url || "";

  return (
    <div className="watch-page">
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

      <div className="video-wrap">
        {loading && (
          <div className="video-placeholder">
            <div className="spinner large" /><p>Memuat episode...</p>
          </div>
        )}
        {!loading && err && (
          <div className="video-placeholder">
            <Ic n="warn" s={44} /><p>{err}</p>
            <button className="btn-primary small" onClick={() => loadEpisode(curSlug, curNum)}>
              <Ic n="retry" s={14} /> Retry
            </button>
          </div>
        )}
        {!loading && !err && videoUrl && <VideoEmbed url={videoUrl} title={`Episode ${curNum}`} />}
        {!loading && !err && !videoUrl && (
          <div className="video-placeholder">
            <Ic n="tv" s={52} />
            <p>{players.length === 0 ? "Tidak ada player tersedia" : "Pilih server di bawah"}</p>
          </div>
        )}
      </div>

      {!loading && players.length > 0 && (
        <div className="watch-controls">
          <p className="controls-label">Server / Player:</p>
          <div className="server-list">
            {players.map((p, i) => (
              <button key={i} className={`server-btn ${player === p ? "active" : ""}`}
                onClick={() => setPlayer(p)}>
                {p.name || `Server ${i + 1}`}
              </button>
            ))}
          </div>
          {videoUrl && (
            <a href={videoUrl} target="_blank" rel="noreferrer" className="open-ext">
              <Ic n="ext" s={13} /> Buka di tab baru jika tidak bisa diputar
            </a>
          )}
        </div>
      )}

      {sortedEps.length > 0 && (
        <div className="watch-controls ep-navigator">
          <p className="controls-label">Episode ({sortedEps.length} total):</p>
          <div className="ep-nav-grid">
            {sortedEps.map(ep => (
              <button key={ep.slug}
                className={`ep-nav-chip ${ep.slug === curSlug ? "current" : ""}`}
                onClick={() => navToEp(ep)}>
                {ep.episode || "?"}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const location = useLocation();
  const isWatch  = location.pathname.startsWith("/watch/");
  const toasts   = useToast();

  return (
    <div className="app">
      <style>{CSS}</style>
      {!isWatch && <Navbar />}
      <ToastContainer toasts={toasts} />
      <main className={isWatch ? "main-watch" : "main"}>
        <Routes>
          <Route path="/"              element={<HomePage />} />
          <Route path="/search/:query" element={<SearchPage />} />
          <Route path="/genres"        element={<GenresPage />} />
          <Route path="/genre/:slug"   element={<GenreDetailPage />} />
          <Route path="/favorites"     element={<FavoritesPage />} />
          <Route path="/detail/:slug"  element={<DetailPage />} />
          <Route path="/watch/:epSlug" element={<WatchPage />} />
          <Route path="*" element={
            <div className="empty-state" style={{ paddingTop: 120 }}>
              <Ic n="warn" s={48} />
              <p>Halaman tidak ditemukan</p>
              <Link to="/" className="btn-primary" style={{ textDecoration: "none" }}>Ke Home</Link>
            </div>
          } />
        </Routes>
      </main>
    </div>
  );
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#080810; --bg2:#0e0e1a; --bg3:#141422; --card:#111120;
  --acc:#e8445a; --acc2:#f5a623; --green:#3ecf8e;
  --t:#eeeef8;   --t2:#7777a0; --border:#1e1e36;
  --r:10px; --sh:0 8px 32px rgba(0,0,0,.7);
  --font:'Plus Jakarta Sans',sans-serif;
}
html{scroll-behavior:smooth}
body{background:var(--bg);color:var(--t);font-family:var(--font);min-height:100vh}
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-track{background:var(--bg2)}
::-webkit-scrollbar-thumb{background:var(--acc);border-radius:2px}

/* SCROLL PROGRESS */
.scroll-progress{
  position:absolute;bottom:0;left:0;height:2px;
  background:linear-gradient(90deg,var(--acc),var(--acc2));
  transition:width .1s linear;z-index:300;
}

/* APP */
.app{min-height:100vh;display:flex;flex-direction:column}
.main{flex:1;padding-top:68px;padding-bottom:56px}
.main-watch{flex:1;padding-top:0}

/* NAVBAR */
.navbar{
  position:fixed;top:0;left:0;right:0;z-index:200;height:68px;
  background:rgba(8,8,16,.94);backdrop-filter:blur(20px) saturate(1.5);
  border-bottom:1px solid var(--border);
  display:flex;align-items:center;padding:0 20px;gap:16px;
}
.nav-logo{
  font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:3px;
  cursor:pointer;color:var(--t);white-space:nowrap;flex-shrink:0;
  display:flex;align-items:center;
}
.nav-logo span:first-child{color:var(--acc)}
.logo-dot{color:var(--acc2);margin-left:1px}
.nav-search{
  flex:1;max-width:380px;display:flex;align-items:center;
  background:var(--bg3);border:1px solid var(--border);border-radius:10px;
  padding:0 12px;gap:8px;transition:border-color .2s;
}
.nav-search:focus-within{border-color:var(--acc)}
.search-icon-left{color:var(--t2);flex-shrink:0}
.search-input{
  flex:1;background:transparent;border:none;outline:none;
  color:var(--t);font-family:var(--font);font-size:13px;padding:10px 0;
}
.search-input::placeholder{color:var(--t2)}
.search-btn{
  background:var(--acc);color:#fff;border:none;border-radius:7px;
  padding:5px 12px;font-family:var(--font);font-size:12px;font-weight:600;
  cursor:pointer;flex-shrink:0;transition:background .2s;
}
.search-btn:hover{background:#d53050}
.nav-links{display:flex;gap:4px;flex-shrink:0}
.nav-link{
  display:flex;align-items:center;gap:7px;padding:8px 14px;
  background:transparent;border:1px solid transparent;color:var(--t2);
  border-radius:9px;cursor:pointer;font-family:var(--font);font-size:13px;
  transition:all .2s;white-space:nowrap;
}
.nav-link:hover{color:var(--t);border-color:var(--border)}
.nav-link.active{color:var(--acc);border-color:rgba(232,68,90,.3);background:rgba(232,68,90,.07)}
.mobile-search-btn{display:none;background:transparent;border:none;color:var(--t2);cursor:pointer;padding:8px}
.mobile-search-bar{
  display:none;position:absolute;top:68px;left:0;right:0;
  background:var(--bg2);border-bottom:1px solid var(--border);
  padding:10px 16px;gap:8px;align-items:center;
}

/* HERO */
.hero{
  position:relative;min-height:380px;display:flex;align-items:center;
  overflow:hidden;padding:60px 28px 50px;
}
.hero-noise{
  position:absolute;inset:0;opacity:.04;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)'/%3E%3C/svg%3E");
}
.hero-glow{
  position:absolute;top:-60px;left:50%;transform:translateX(-50%);
  width:700px;height:400px;border-radius:50%;
  background:radial-gradient(ellipse,rgba(232,68,90,.18) 0%,transparent 70%);
  pointer-events:none;
}
.hero-content{position:relative;z-index:1}
.hero-badge{
  display:inline-flex;align-items:center;gap:6px;
  padding:4px 12px;background:rgba(232,68,90,.12);
  border:1px solid rgba(232,68,90,.3);border-radius:50px;
  font-size:11px;font-weight:700;color:var(--acc);
  letter-spacing:1px;text-transform:uppercase;margin-bottom:16px;
}
.hero-title{
  font-family:'Bebas Neue',sans-serif;
  font-size:clamp(56px,10vw,96px);letter-spacing:6px;
  line-height:.9;color:var(--t);
}
.hero-title span:first-child{color:var(--acc)}
.hero-dot{color:var(--acc2)}
.hero-sub{font-size:16px;color:var(--t2);margin-top:12px;font-weight:400}
.hero-trending{
  display:flex;align-items:center;flex-wrap:wrap;
  gap:8px;margin-top:20px;
}
.hero-trending-label{font-size:11px;color:var(--t2);font-weight:600;letter-spacing:1px;text-transform:uppercase}
.hero-trending-chip{
  padding:4px 12px;background:rgba(255,255,255,.05);
  border:1px solid var(--border);border-radius:50px;
  color:var(--t2);font-family:var(--font);font-size:11px;cursor:pointer;
  transition:all .2s;white-space:nowrap;max-width:180px;
  overflow:hidden;text-overflow:ellipsis;
}
.hero-trending-chip:hover{color:var(--acc);border-color:rgba(232,68,90,.4)}

/* SECTIONS */
.section{padding:28px 20px 0}
.section-title{
  display:flex;align-items:center;gap:10px;
  font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:2px;
  color:var(--t);margin-bottom:16px;
}
.accent-bar{color:var(--acc);font-size:18px}
.section-count{
  font-family:var(--font);font-size:11px;font-weight:600;
  color:var(--t2);background:var(--bg3);
  border:1px solid var(--border);border-radius:50px;
  padding:2px 8px;letter-spacing:0;
}

/* PAGE HEADER */
.page-header{
  padding:22px 20px 8px;
  display:flex;align-items:center;gap:12px;
}
.page-header h2{font-size:20px;font-weight:700}
.result-count{padding:0 20px 8px;font-size:12px;color:var(--t2)}
.accent{color:var(--acc)}

/* CARDS */
.cards-grid{
  display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));
  gap:14px;padding:0 20px;
}
.card{cursor:pointer;transition:transform .25s}
.card:hover{transform:translateY(-4px)}
.card-img{
  position:relative;border-radius:var(--r);overflow:hidden;
  aspect-ratio:2/3;background:var(--bg3);
}
.card-img img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .4s}
.card:hover .card-img img{transform:scale(1.06)}
.card-overlay{
  position:absolute;inset:0;background:rgba(0,0,0,.55);
  opacity:0;transition:opacity .25s;display:flex;align-items:center;justify-content:center;
}
.card:hover .card-overlay{opacity:1}
.play-circle{
  width:44px;height:44px;border-radius:50%;
  background:var(--acc);display:flex;align-items:center;justify-content:center;
  color:#fff;transform:scale(.8);transition:transform .2s;
}
.card:hover .play-circle{transform:scale(1)}
.card-badge{
  position:absolute;top:8px;left:8px;
  padding:2px 8px;background:var(--acc);color:#fff;
  border-radius:5px;font-size:10px;font-weight:700;
}
.card-eps{
  position:absolute;bottom:8px;right:8px;
  padding:2px 7px;background:rgba(0,0,0,.8);color:var(--t);
  border-radius:5px;font-size:10px;font-weight:600;
}
.card-rank{
  position:absolute;top:8px;right:8px;z-index:2;
  font-family:'Bebas Neue',sans-serif;font-size:28px;
  color:rgba(255,255,255,.15);line-height:1;pointer-events:none;
}
.card-watched{
  position:absolute;bottom:0;left:0;right:0;
  background:linear-gradient(to top,rgba(232,68,90,.9),transparent);
  padding:16px 8px 6px;font-size:10px;font-weight:600;color:#fff;
}
.card-title{
  font-size:12px;font-weight:500;color:var(--t);
  margin-top:9px;line-height:1.4;
  overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;
}

/* SKELETON */
.skeleton-card .card-img,.ske{
  background:linear-gradient(90deg,var(--bg3) 25%,#1e1e38 50%,var(--bg3) 75%);
  background-size:200% 100%;
  animation:shimmer 1.6s infinite;border-radius:var(--r);
}
.ske-img{aspect-ratio:2/3;width:100%;display:block}
.ske-text{height:12px;border-radius:6px;display:block}
@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
.skeleton-card{cursor:default}
.skeleton-card:hover{transform:none}

/* CONTINUE WATCHING */
.continue-carousel{
  display:flex;gap:12px;overflow-x:auto;padding:0 20px 12px;
  -ms-overflow-style:none;scrollbar-width:none;
}
.continue-carousel::-webkit-scrollbar{display:none}
.continue-card{
  flex:0 0 130px;cursor:pointer;transition:transform .2s;
}
.continue-card:hover{transform:translateY(-3px)}
.continue-card-img{
  position:relative;border-radius:9px;overflow:hidden;
  aspect-ratio:2/3;background:var(--bg3);
}
.continue-card-img img{width:100%;height:100%;object-fit:cover}
.continue-card-play{
  position:absolute;inset:0;background:rgba(0,0,0,.5);
  display:flex;align-items:center;justify-content:center;
  opacity:0;transition:opacity .2s;color:#fff;
}
.continue-card:hover .continue-card-play{opacity:1}
.continue-card-ep-badge{
  position:absolute;bottom:6px;left:6px;
  background:var(--acc);color:#fff;
  font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;
}
.continue-card-title{
  font-size:11px;color:var(--t2);margin-top:7px;
  overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;
}

/* GENRES GRID */
.genres-grid{display:flex;flex-wrap:wrap;gap:8px;padding:0 20px}
.genre-chip{
  display:flex;align-items:center;gap:6px;padding:8px 16px;
  background:var(--bg3);border:1px solid var(--border);color:var(--t2);
  border-radius:8px;cursor:pointer;font-family:var(--font);font-size:13px;
  transition:all .2s;
}
.genre-chip:hover{border-color:var(--acc);color:var(--acc);background:rgba(232,68,90,.06)}

/* TOAST */
.toast-container{
  position:fixed;bottom:24px;right:20px;z-index:1000;
  display:flex;flex-direction:column;gap:8px;
}
.toast{
  padding:10px 18px;border-radius:10px;font-size:13px;font-weight:500;
  animation:toastIn .3s ease;backdrop-filter:blur(10px);
  border:1px solid var(--border);
}
.toast-success{background:rgba(62,207,142,.15);color:var(--green);border-color:rgba(62,207,142,.3)}
.toast-info{background:rgba(255,255,255,.08);color:var(--t)}
.toast-error{background:rgba(232,68,90,.15);color:var(--acc);border-color:rgba(232,68,90,.3)}
@keyframes toastIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}

/* BUTTONS */
.btn-primary{
  display:flex;align-items:center;gap:8px;padding:11px 22px;
  background:var(--acc);color:#fff;border:none;border-radius:9px;
  cursor:pointer;font-family:var(--font);font-size:14px;font-weight:600;transition:all .2s;
}
.btn-primary:hover:not(:disabled){background:#d53050;transform:translateY(-1px)}
.btn-primary:disabled{opacity:.4;cursor:not-allowed}
.btn-primary.small{padding:8px 16px;font-size:13px}
.btn-secondary{
  display:flex;align-items:center;gap:8px;padding:11px 18px;
  background:var(--bg3);color:var(--t);border:1px solid var(--border);border-radius:9px;
  cursor:pointer;font-family:var(--font);font-size:13px;transition:all .2s;
}
.btn-secondary:hover{border-color:var(--acc);color:var(--acc)}
.btn-icon{
  display:flex;align-items:center;justify-content:center;
  width:44px;height:44px;background:var(--bg3);
  border:1px solid var(--border);border-radius:9px;
  cursor:pointer;color:var(--t2);transition:all .2s;flex-shrink:0;
}
.btn-icon:hover{border-color:var(--acc);color:var(--acc)}
.fav-active{color:var(--acc);border-color:var(--acc);background:rgba(232,68,90,.1)}
.back-btn{
  display:flex;align-items:center;gap:7px;padding:8px 16px;
  background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.15);color:var(--t);
  border-radius:8px;cursor:pointer;font-family:var(--font);font-size:13px;transition:all .2s;
}
.back-btn:hover{border-color:var(--acc);color:var(--acc)}
.back-btn.flat{background:transparent;border:none;color:var(--t2);padding:8px}
.back-btn.flat:hover{color:var(--acc)}
.show-all-btn{margin-top:12px}

/* EP SEARCH */
.ep-search{
  width:100%;max-width:240px;padding:8px 12px;
  background:var(--bg3);border:1px solid var(--border);border-radius:8px;
  color:var(--t);font-family:var(--font);font-size:13px;outline:none;margin-bottom:12px;
}
.ep-search:focus{border-color:var(--acc)}
.ep-search::placeholder{color:var(--t2)}

/* PAGINATION */
.pagination{display:flex;align-items:center;justify-content:center;gap:16px;padding:32px 20px}
.page-btn{
  display:flex;align-items:center;gap:6px;padding:10px 20px;
  background:var(--bg3);border:1px solid var(--border);color:var(--t);
  border-radius:8px;cursor:pointer;font-family:var(--font);font-size:13px;transition:all .2s;
}
.page-btn:hover:not(:disabled){border-color:var(--acc);color:var(--acc)}
.page-btn:disabled{opacity:.35;cursor:not-allowed}
.page-num{font-size:13px;color:var(--t2)}

/* DETAIL */
.det-hero{position:relative;min-height:460px;display:flex;align-items:flex-end;overflow:hidden}
.det-hero-blur{
  position:absolute;inset:0;
  background-image:var(--thumb);
  background-size:cover;background-position:center top;
  filter:blur(28px) saturate(.4) brightness(.55);
  transform:scale(1.08);
}
.det-hero-blur::after{
  content:'';position:absolute;inset:0;
  background:linear-gradient(to bottom,rgba(8,8,16,.2) 0%,rgba(8,8,16,.98) 92%);
}
.det-hero-content{position:relative;z-index:1;width:100%;padding:24px}
.det-layout{display:flex;gap:24px;margin-top:20px;flex-wrap:wrap}
.det-poster-wrap{position:relative;flex-shrink:0}
.det-poster{
  width:160px;border-radius:12px;
  object-fit:cover;aspect-ratio:2/3;
  box-shadow:var(--sh);background:var(--bg3);display:block;
}
.det-score-badge{
  position:absolute;bottom:-10px;left:50%;transform:translateX(-50%);
  background:var(--acc2);color:#000;font-size:11px;font-weight:700;
  padding:3px 10px;border-radius:50px;display:flex;align-items:center;gap:4px;white-space:nowrap;
}
.det-info{flex:1;display:flex;flex-direction:column;gap:12px;min-width:220px}
.det-badges{display:flex;flex-wrap:wrap;gap:6px}
.badge{padding:3px 9px;border-radius:4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px}
.badge-type{background:rgba(232,68,90,.15);color:var(--acc);border:1px solid rgba(232,68,90,.3)}
.badge-on{background:rgba(62,207,142,.14);color:var(--green);border:1px solid rgba(62,207,142,.3)}
.badge-done{background:rgba(136,136,168,.1);color:var(--t2);border:1px solid var(--border)}
.det-title{font-family:'Bebas Neue',sans-serif;font-size:clamp(26px,5vw,42px);letter-spacing:2px;line-height:1.05}
.det-stats{display:flex;flex-wrap:wrap;gap:14px}
.det-stats span{display:flex;align-items:center;gap:5px;font-size:12px;color:var(--t2)}
.det-genres{display:flex;flex-wrap:wrap;gap:6px}
.genre-tag{padding:3px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:5px;font-size:11px;color:var(--t2)}
.det-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:4px}
.det-section{padding:28px 20px 0}
.det-section-label{font-size:11px;font-weight:700;color:var(--t2);text-transform:uppercase;letter-spacing:2px;margin-bottom:14px;display:flex;align-items:center;gap:8px}
.ep-count{font-size:13px;color:var(--t2);font-weight:400;letter-spacing:0;text-transform:none}
.synopsis{font-size:14px;line-height:1.95;color:var(--t2);white-space:pre-line}
.info-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px}
.info-cell{display:flex;gap:12px;background:var(--card);border-radius:8px;padding:10px 14px;border:1px solid var(--border)}
.info-key{font-size:11px;color:var(--t2);min-width:90px;flex-shrink:0;padding-top:1px}
.info-val{font-size:13px;color:var(--t);font-weight:500}
.text-green{color:var(--green)!important}
.text-dim{color:var(--t2)!important}
.ep-grid{display:flex;flex-wrap:wrap;gap:7px}
.ep-chip{
  padding:8px 13px;background:var(--card);border:1px solid var(--border);
  border-radius:7px;color:var(--t2);cursor:pointer;
  font-family:var(--font);font-size:12px;transition:all .2s;
  display:flex;align-items:center;gap:5px;
}
.ep-chip:hover{border-color:var(--acc);color:var(--t)}
.ep-active{background:rgba(232,68,90,.15);border-color:var(--acc);color:var(--acc)}

/* WATCH */
.watch-page{display:flex;flex-direction:column;min-height:100vh;background:var(--bg)}
.watch-topbar{
  display:flex;align-items:center;gap:10px;padding:10px 14px;
  background:var(--bg2);border-bottom:1px solid var(--border);
  position:sticky;top:0;z-index:100;
}
.watch-meta{flex:1;cursor:pointer;min-width:0;overflow:hidden}
.watch-series{font-size:14px;color:var(--acc);font-weight:600;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.watch-series:hover{text-decoration:underline}
.watch-ep-label{font-size:11px;color:var(--t2)}
.watch-nav-btns{display:flex;gap:6px}
.ep-nav-btn{
  display:flex;align-items:center;gap:4px;padding:7px 12px;
  background:var(--bg3);border:1px solid var(--border);color:var(--t2);
  border-radius:7px;cursor:pointer;font-family:var(--font);font-size:12px;transition:all .2s;
}
.ep-nav-btn:hover:not(:disabled){border-color:var(--acc);color:var(--acc)}
.ep-nav-btn:disabled{opacity:.3;cursor:not-allowed}
.video-wrap{width:100%;aspect-ratio:16/9;background:#000;position:relative}
.video-iframe{width:100%;height:100%;border:none;display:block}
.video-placeholder{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;color:var(--t2);text-align:center;padding:0 24px}
.watch-controls{padding:14px 16px;background:var(--bg2);border-top:1px solid var(--border);display:flex;flex-direction:column;gap:10px}
.watch-controls.ep-navigator{max-height:260px}
.controls-label{font-size:11px;text-transform:uppercase;letter-spacing:2px;color:var(--t2);font-weight:600;margin-bottom:2px}
.server-list{display:flex;flex-wrap:wrap;gap:8px}
.server-btn{padding:8px 16px;background:var(--bg3);border:1px solid var(--border);color:var(--t2);border-radius:8px;cursor:pointer;font-family:var(--font);font-size:13px;transition:all .2s}
.server-btn:hover{border-color:var(--acc);color:var(--t)}
.server-btn.active{background:var(--acc);border-color:var(--acc);color:#fff}
.open-ext{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--t2);text-decoration:none;width:fit-content}
.open-ext:hover{color:var(--acc)}
.ep-nav-grid{display:flex;flex-wrap:wrap;gap:5px;max-height:200px;overflow-y:auto;padding-right:4px}
.ep-nav-chip{
  padding:6px 10px;background:var(--bg3);border:1px solid var(--border);
  color:var(--t2);border-radius:6px;cursor:pointer;
  font-family:var(--font);font-size:12px;transition:all .2s;min-width:38px;text-align:center;
}
.ep-nav-chip:hover{border-color:var(--acc);color:var(--t)}
.ep-nav-chip.current{background:var(--acc);border-color:var(--acc);color:#fff}

/* SPINNER / ERROR */
.spinner-wrap{display:flex;flex-direction:column;align-items:center;gap:14px;padding:60px 20px;color:var(--t2)}
.spinner{width:36px;height:36px;border:3px solid var(--border);border-top-color:var(--acc);border-radius:50%;animation:sp .8s linear infinite}
.spinner.large{width:48px;height:48px;border-width:4px}
@keyframes sp{to{transform:rotate(360deg)}}
.err-box,.empty-state{display:flex;flex-direction:column;align-items:center;gap:14px;padding:60px 20px;color:var(--t2);text-align:center}
.err-box svg{color:var(--acc)}
.empty-state.small{padding:32px 20px}
.empty-state svg{opacity:.4}
.ske{
  display:block;background:linear-gradient(90deg,var(--bg3) 25%,#1e1e38 50%,var(--bg3) 75%);
  background-size:200% 100%;animation:shimmer 1.6s infinite;border-radius:var(--r);
}

/* RESPONSIVE */
@media(max-width:640px){
  .navbar{padding:0 12px;gap:10px;flex-wrap:wrap;height:auto;min-height:56px;padding-top:10px;padding-bottom:10px}
  .nav-search{display:none}
  .mobile-search-btn{display:flex}
  .mobile-search-bar{display:flex}
  .nav-links span{display:none}
  .nav-link{padding:8px}
  .cards-grid{grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;padding:0 12px}
  .section{padding:20px 0 0}
  .det-poster{width:120px}
  .info-grid{grid-template-columns:1fr}
  .watch-topbar{flex-wrap:wrap}
  .main{padding-top:56px}
}
`;
