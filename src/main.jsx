import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { io } from "socket.io-client";
import {
  ArrowUpRight,
  ArrowRight,
  Trophy,
  Volume2,
  VolumeX,
  X,
  Radio,
  Swords,
  Check,
  BookOpen,
  WifiOff,
  LogOut,
  Target,
  Clock3,
} from "lucide-react";
import {
  DISCIPLINES,
  MODES,
  TIERS,
  tierFor,
  levelFor,
  validateConfig,
} from "../shared/game.js";
import {
  createPractice,
  practiceSnapshot,
  answerPractice,
  expirePractice,
} from "./practice.js";
import { effect, setAudio } from "./audio.js";
import Arena from "./Arena.jsx";
import { useSceneNavigation } from "./useSceneNavigation.js";
import "./styles.css";
import "./extras.css";
import "./persona.css";
const readLocal = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const saveLocal = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Private browsing may disable storage. */
  }
};
const secondsText = (ms) => {
  const s = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const elapsedText = (ms) => `${(ms / 1000).toFixed(2)} с`;
async function api(path, body) {
  const response = await fetch(`/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response
    .json()
    .catch(() => ({ error: "Сервер временно недоступен." }));
  if (!response.ok)
    throw new Error(data.error || "Слишком много запросов. Попробуйте позже.");
  return data;
}
function Modal({ title, children, onClose }) {
  const ref = useRef();
  useEffect(() => {
    const previous = document.activeElement,
      root = document.getElementById("app-content");
    root?.setAttribute("inert", "");
    const focusable = () => [
      ...ref.current.querySelectorAll(
        "button:not(:disabled),input,select,a[href]",
      ),
    ];
    focusable()[0]?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const els = focusable(),
          first = els[0],
          last = els.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      root?.removeAttribute("inert");
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="modal"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="modal-header">
          <h2 id="modal-title">{title}</h2>
          <button
            className="close-button"
            onClick={onClose}
            aria-label="Закрыть"
          >
            <X size={19} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
function Leaderboard({ players, full = false, onMore }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>
          <Trophy size={16} /> {full ? "Общий рейтинг" : "Вершина арены"}
        </h2>
        {!full && (
          <button className="text-button" onClick={onMore}>
            Весь рейтинг <ArrowUpRight size={13} />
          </button>
        )}
      </div>
      {players.length ? (
        <div className="table-wrap">
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Игрок</th>
                <th>Тир</th>
                <th className="align-right">Рейтинг</th>
                {full && <th>Победы</th>}
              </tr>
            </thead>
            <tbody>
              {players.slice(0, full ? 50 : 5).map((p, i) => (
                <tr key={p.id}>
                  <td className="rank-number">
                    {String(i + 1).padStart(2, "0")}
                  </td>
                  <td>
                    <div className="player-cell">
                      <span className="avatar">
                        {p.username.slice(0, 2).toUpperCase()}
                      </span>
                      <span>{p.username}</span>
                      {full && <small>LV.{p.level}</small>}
                    </div>
                  </td>
                  <td>
                    <span className={`tier-badge tier-${p.tier.toLowerCase()}`}>
                      {p.tier}
                    </span>
                  </td>
                  <td className="rating align-right">
                    {p.rating.toLocaleString("ru")}
                  </td>
                  {full && (
                    <td>
                      {p.wins}/{p.games}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          <Trophy size={26} />
          <p>
            Первое место пока свободно.
            <br />
            Сыграй рейтинговый матч и открой таблицу лидеров.
          </p>
        </div>
      )}
    </section>
  );
}
function PersonalCard({ user, onAuth }) {
  const next = user && TIERS.find((t) => t.min > user.rating);
  return (
    <section className="panel personal-card">
      <div className="panel-heading">
        <h2>
          <Target size={16} /> Твоя траектория
        </h2>
        <span className="tier-badge">{user?.tier || "UNRANKED"}</span>
      </div>
      <div className="rating-big">
        {user ? user.rating.toLocaleString("ru") : "—"}
        <small>MR</small>
      </div>
      <p className="muted">
        {user
          ? next
            ? `${Math.max(0, next.min - user.rating)} MR до ${next.name}`
            : "Ты в высшей лиге. Держи планку."
          : "Каждая победа — шаг выше."}
      </p>
      <div className="progress-track">
        <div
          className="progress-fill"
          style={{
            width: user
              ? `${next ? Math.max(0, Math.min(100, ((user.rating - tierFor(user.rating).min) / (next.min - tierFor(user.rating).min)) * 100)) : 100}%`
              : "0%",
          }}
        />
      </div>
      <div className="stat-grid">
        <div className="stat">
          <strong>{user?.games || "0"}</strong>
          <span>Матчи</span>
        </div>
        <div className="stat">
          <strong>
            {user?.games ? Math.round((user.wins / user.games) * 100) : 0}%
          </strong>
          <span>Победы</span>
        </div>
        <div className="stat">
          <strong>{user?.level || "1"}</strong>
          <span>Уровень</span>
        </div>
      </div>
      {!user && (
        <button className="text-button" onClick={onAuth}>
          Забрать свой ник <ArrowRight size={14} />
        </button>
      )}
    </section>
  );
}
function App() {
  const { page, navigate, jumpTo, phase, advance } = useSceneNavigation();
  const [user, setUser] = useState(null),
    [players, setPlayers] = useState([]),
    [history, setHistory] = useState([]);
  const [modal, setModal] = useState(null),
    [authAction, setAuthAction] = useState("register"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [config, setConfig] = useState({
      mode: "blitz",
      discipline: "calculus",
      duration: 60,
    }),
    [network, setNetwork] = useState("offline"),
    [roomCode, setRoomCode] = useState("");
  const [queue, setQueue] = useState({ status: "idle" }),
    [game, setGame] = useState(null),
    [answer, setAnswer] = useState(""),
    [selectedIndex, setSelectedIndex] = useState(0),
    [now, setNow] = useState(Date.now());
  const [sound, setSound] = useState(false),
    [connected, setConnected] = useState(false),
    [stats, setStats] = useState({ online: 0 }),
    [apiOffline, setApiOffline] = useState(false);
  const [practices, setPractices] = useState(() => {
    const p = readLocal("mathvs-practice", []);
    return Array.isArray(p) ? p : [];
  });
  const socket = useRef(null),
    practice = useRef(null),
    savedPractice = useRef(null),
    pending = useRef(null),
    gameId = useRef(null),
    finishedId = useRef(null);
  const closeModal = useCallback(() => {
    setModal(null);
    setError("");
  }, []);
  const refresh = useCallback(async () => {
    try {
      const [me, leaders, s] = await Promise.all([
        api("/me"),
        api("/leaderboard"),
        api("/stats"),
      ]);
      setUser(me.user);
      setPlayers(leaders.players);
      setStats(s);
      setApiOffline(false);
      if (me.user) setHistory((await api("/history")).matches);
      else setHistory([]);
    } catch {
      setApiOffline(true);
    }
  }, []);
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, [refresh]);
  useEffect(() => {
    if (!user) {
      socket.current?.disconnect();
      socket.current = null;
      setConnected(false);
      return;
    }
    const s = io({ autoConnect: true });
    socket.current = s;
    s.on("connect", () => {
      setConnected(true);
      s.emit("match:sync", { matchId: gameId.current }, () => {});
    });
    s.on("disconnect", () => {
      setConnected(false);
      setQueue({ status: "idle" });
    });
    s.on("connect_error", (e) => {
      setConnected(false);
      setError(
        e.message === "xhr poll error"
          ? "Нет связи с игровым сервером."
          : e.message,
      );
    });
    s.on("queue:state", setQueue);
    s.on("match:state", (snapshot) => {
      practice.current = null;
      setGame(snapshot);
      setNow(Date.now() + (snapshot.serverNow - Date.now()));
      setAnswer("");
      if (gameId.current !== snapshot.id) {
        gameId.current = snapshot.id;
        setSelectedIndex(0);
        jumpTo("game");
        setModal(null);
        effect("start");
      }
      if (snapshot.result && finishedId.current !== snapshot.id) {
        finishedId.current = snapshot.id;
        effect("finish");
        refresh();
      }
    });
    return () => {
      s.disconnect();
      if (socket.current === s) socket.current = null;
    };
  }, [user?.id, refresh, jumpTo]);
  const clockOffset = useRef(0);
  useEffect(() => {
    if (game?.serverNow && !game.offline)
      clockOffset.current = game.serverNow - Date.now();
    else clockOffset.current = 0;
  }, [game]);
  useEffect(() => {
    if (!game || game.result) return;
    const tick = () => {
      if (page === "game" && !document.hidden)
        setNow(Date.now() + clockOffset.current);
      const p = practice.current;
      if (p && expirePractice(p)) {
        setGame(practiceSnapshot(p));
        setAnswer("");
      }
    };
    tick();
    const timer = setInterval(tick, 100);
    return () => clearInterval(timer);
  }, [game?.id, !!game?.result, page]);
  useEffect(() => {
    const p = practice.current;
    if (p?.result && savedPractice.current !== p.id) {
      savedPractice.current = p.id;
      effect("finish");
      setPractices((previous) => {
        const next = [p.result, ...previous].slice(0, 30);
        saveLocal("mathvs-practice", next);
        return next;
      });
    }
  }, [game?.id, !!game?.result]);
  useEffect(() => {
    const onOnline = () => refresh();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOnline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOnline);
    };
  }, [refresh]);
  async function send(event, payload = {}) {
    if (!socket.current?.connected)
      throw new Error("Нет связи с сервером. Подождите переподключения.");
    return new Promise((resolve, reject) =>
      socket.current.timeout(6000).emit(event, payload, (err, result) => {
        if (err) reject(new Error("Сервер не ответил. Проверьте соединение."));
        else if (result?.error) reject(new Error(result.error));
        else resolve(result);
      }),
    );
  }
  function openMode(mode) {
    effect("click");
    setConfig((c) => ({ ...c, mode }));
    setNetwork("offline");
    setError("");
    setModal("config");
  }
  async function startGame() {
    setError("");
    let valid;
    try {
      valid = validateConfig({
        ...config,
        duration:
          config.mode === "long" ? config.duration : MODES[config.mode].seconds,
      });
    } catch (e) {
      setError(e.message);
      return;
    }
    if (network === "offline") {
      practice.current = createPractice(valid);
      setGame(practiceSnapshot(practice.current));
      setSelectedIndex(0);
      setAnswer("");
      jumpTo("game");
      setModal(null);
      effect("start");
      return;
    }
    if (!user) {
      pending.current = { ...valid, network, roomCode };
      setModal("auth");
      return;
    }
    setBusy(true);
    try {
      await send(
        network === "ranked"
          ? "queue:join"
          : network === "create"
            ? "room:create"
            : "room:join",
        network === "join" ? { code: roomCode } : valid,
      );
      setModal(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function authenticate(e) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const response = await api(`/auth/${authAction}`, {
        username: data.get("username"),
        password: data.get("password"),
      });
      setUser(response.user);
      if (pending.current) {
        setConfig(pending.current);
        setNetwork(pending.current.network);
        setRoomCode(pending.current.roomCode);
        pending.current = null;
        setModal("config");
      } else setModal(null);
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(value, index) {
    if (busy || now < game.startedAt || game.done) return;
    setBusy(true);
    setError("");
    try {
      if (game.offline) {
        answerPractice(practice.current, index, value);
        setGame(practiceSnapshot(practice.current));
      } else
        await send("match:answer", { matchId: game.id, index, answer: value });
      setAnswer("");
      effect("answer");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    setError("");
  }, [page]);
  const activeGame = game && !game.result;
  const result = game?.result,
    myResult = result?.players.find(
      (p) => p.id === (game.offline ? 0 : user?.id),
    );
  const grand = game?.config.mode === "grand";
  const currentIndex =
    grand && game.questions?.[selectedIndex] ? selectedIndex : game?.index;
  const question = grand ? game?.questions?.[currentIndex] : game?.question;
  const submitted = game?.answers?.find((a) => a.index === currentIndex);
  const remaining = game ? Math.max(0, game.deadline - now) : 0;
  const countdown = game
    ? Math.max(0, Math.ceil((game.startedAt - now) / 1000))
    : 0;
  const available =
    !busy &&
    !game?.done &&
    !submitted &&
    countdown === 0 &&
    (game?.offline || connected);
  const outcomeTitle = {
    win: "ПОБЕДА.",
    loss: "ЕЩЁ ОДИН РАУНД?",
    draw: "НА РАВНЫХ.",
    practice: "РАУНД ЗАВЕРШЁН.",
  };
  return (
    <>
      <div className={`app-shell screen-${page}`} id="app-content">
        {phase && (
          <div
            className="transition-overlay"
            data-phase={phase}
            aria-hidden="true"
          >
            <div
              className={`transition-surface ${phase}`}
              onAnimationEnd={advance}
            />
          </div>
        )}
        <header className="topbar">
          <button
            className="brand brand-button"
            onClick={() => navigate("arena")}
            aria-label="MATHVS — главная"
          >
            <span className="brand-mark">M</span>MATH<span>VS</span>
          </button>
          <nav className="nav-links" aria-label="Основная навигация">
            {[
              ["arena", "Арена"],
              ["rating", "Рейтинг"],
              ["profile", "Профиль"],
            ].map(([id, title]) => (
              <button
                key={id}
                className={`nav-link ${page === id ? "active" : ""}`}
                onClick={() => navigate(id)}
              >
                {title}
              </button>
            ))}
          </nav>
          <div className="topbar-right">
            <span>
              <i className="online-dot" />
              {stats.online} В СЕТИ
            </span>
            <button
              className="sound-toggle"
              aria-label={
                sound ? "Выключить музыку и звук" : "Включить музыку и звук"
              }
              aria-pressed={sound}
              title={sound ? "Звук включён" : "Включить звук"}
              onClick={() => {
                setAudio(!sound);
                setSound(!sound);
              }}
            >
              {sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
            </button>
            <button
              className="profile-chip"
              onClick={() => (user ? navigate("profile") : setModal("auth"))}
            >
              <span className="avatar">
                {user?.username.slice(0, 2).toUpperCase() || "→"}
              </span>
              <span>{user?.username || "Войти"}</span>
            </button>
          </div>
        </header>
        <main className="page page-view" key={page}>
          {apiOffline && (
            <div className="offline-banner">
              <WifiOff size={14} /> Сервер недоступен. Офлайн-тренировка
              работает.
            </div>
          )}
          {activeGame && page !== "game" && (
            <button className="resume-banner" onClick={() => navigate("game")}>
              <Radio size={16} /> Матч продолжается — вернуться{" "}
              <ArrowRight size={16} />
            </button>
          )}
          {page === "arena" && (
            <Arena
              disabled={!!activeGame || queue.status !== "idle"}
              user={user}
              stats={stats}
              onMode={openMode}
              onRules={() => setModal("rules")}
            >
              <div className="dashboard-bottom">
                <Leaderboard
                  players={players}
                  onMore={() => navigate("rating")}
                />
                <PersonalCard user={user} onAuth={() => setModal("auth")} />
              </div>
            </Arena>
          )}
          {page === "rating" && (
            <section className="subpage">
              <div className="eyebrow">Дорога к вершине</div>
              <h1 className="page-title">СИЛЬНЕЙШИЕ УМЫ.</h1>
              <p className="muted">
                Общий рейтинг для всех дисциплин. Начни с 1000 MR и найди свою
                лигу.
              </p>
              <div className="tier-strip">
                {TIERS.map((t) => (
                  <span key={t.name} className="tier-badge">
                    {t.name} · {t.min}+
                  </span>
                ))}
              </div>
              <Leaderboard players={players} full />
            </section>
          )}
          {page === "profile" && (
            <section className="subpage">
              <div className="eyebrow">Личное дело</div>
              <div className="profile-heading">
                <h1 className="page-title">
                  {user?.username || "ТВОЯ ИСТОРИЯ."}
                </h1>
                {user ? (
                  <button
                    className="button secondary small"
                    disabled={!!activeGame}
                    onClick={async () => {
                      try {
                        await send("queue:cancel").catch(() => {});
                        await api("/logout", {});
                        setUser(null);
                        refresh();
                      } catch (e) {
                        setError(e.message);
                      }
                    }}
                  >
                    <LogOut size={14} /> Выйти
                  </button>
                ) : (
                  <button
                    className="button primary"
                    onClick={() => setModal("auth")}
                  >
                    Создать аккаунт
                  </button>
                )}
              </div>
              <div className="dashboard-bottom">
                <PersonalCard user={user} onAuth={() => setModal("auth")} />
                <div className="panel">
                  <h2>Опыт растёт с каждым матчем</h2>
                  <p className="muted">
                    Рейтинговый матч: 30 XP + 15 XP за верный ответ + 50 XP за
                    победу. Уровень показывает опыт, тир — твой рейтинг.
                  </p>
                  <div className="rating-big">
                    {user?.xp || 0}
                    <small>XP</small>
                  </div>
                  <p className="muted">
                    {user
                      ? `${user.level ** 2 * 100 - user.xp} XP до уровня ${user.level + 1}`
                      : "Войди, чтобы сохранять прогресс."}
                  </p>
                </div>
              </div>
              <div className="section-heading">
                <h2>Матчи</h2>
                <span>ПОСЛЕДНИЕ 20</span>
              </div>
              <History matches={history} userId={user?.id} />
              <div className="section-heading">
                <h2>Офлайн-тренировки</h2>
                <span>НА ЭТОМ УСТРОЙСТВЕ</span>
              </div>
              <History matches={practices} userId={0} />
              {error && <p className="error-message">{error}</p>}
            </section>
          )}
          {page === "game" && game && !result && (
            <section className="game-page">
              <div className="game-header">
                <div>
                  <div className="eyebrow">
                    {game.offline
                      ? "SOLO / ТРЕНИРОВКА"
                      : game.ranked
                        ? "RANKED / ДУЭЛЬ"
                        : "PRIVATE / ДУЭЛЬ"}
                  </div>
                  <h1>{MODES[game.config.mode].name}</h1>
                  <p>
                    {DISCIPLINES[game.config.discipline]}
                    {!game.offline && !connected ? " · Переподключение…" : ""}
                  </p>
                </div>
                <div>
                  <div className="timer" role="timer">
                    {countdown ? `СТАРТ ${countdown}` : secondsText(remaining)}
                  </div>
                  <button
                    className="text-button surrender"
                    onClick={() => setModal("forfeit")}
                  >
                    Завершить матч
                  </button>
                </div>
              </div>
              <div className="timer-track">
                <div
                  className="timer-fill"
                  style={{
                    width: `${Math.min(100, (remaining / (game.config.duration * 1000)) * 100)}%`,
                  }}
                />
              </div>
              <div className="game-layout">
                <section className="question-panel">
                  {game.done ? (
                    <div className="empty-state">
                      <Check size={38} />
                      <h2>Ответы приняты</h2>
                      <p>
                        Соперник ещё решает. Результат появится, когда оба
                        завершат матч.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="question-index">
                        {grand && currentIndex >= 8 ? "Задача" : "Вопрос"}{" "}
                        {currentIndex + 1} / {MODES[game.config.mode].count}
                      </div>
                      {grand && (
                        <div
                          className="question-tabs"
                          aria-label="Выбор задания"
                        >
                          {game.questions.map((q, i) => (
                            <button
                              key={i}
                              className={`${currentIndex === i ? "active" : ""} ${game.answers.some((a) => a.index === i) ? "answered" : ""}`}
                              onClick={() => {
                                setSelectedIndex(i);
                                setAnswer("");
                              }}
                            >
                              {i + 1}
                              {game.answers.some((a) => a.index === i) && (
                                <Check size={10} />
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                      <h2
                        className="question-text"
                        key={`${game.id}-${currentIndex}`}
                      >
                        {question?.prompt}
                      </h2>
                      {question?.options ? (
                        <div className="answer-grid">
                          {question.options.map((option, i) => (
                            <button
                              key={option}
                              className={`answer-option ${submitted?.value === option ? "selected" : ""}`}
                              disabled={!available}
                              onClick={() => submit(option, currentIndex)}
                            >
                              <span>{String.fromCharCode(65 + i)}</span>
                              <span>{option}</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            submit(answer, currentIndex);
                          }}
                        >
                          <label htmlFor="math-answer" className="field-label">
                            Числовой ответ · можно дробь, например 1/2
                          </label>
                          <input
                            id="math-answer"
                            className="answer-input"
                            autoComplete="off"
                            inputMode="text"
                            maxLength={64}
                            placeholder="Твой ответ"
                            value={submitted?.value ?? answer}
                            onChange={(e) => setAnswer(e.target.value)}
                            disabled={!available}
                          />
                          <button
                            className="button primary"
                            disabled={!available || !answer.trim()}
                          >
                            Принять ответ <ArrowRight size={16} />
                          </button>
                        </form>
                      )}
                      {submitted && (
                        <p className="muted">
                          <Check size={14} /> Ответ принят. Его нельзя изменить.
                        </p>
                      )}
                      {error && (
                        <p className="error-message" role="alert">
                          {error}
                        </p>
                      )}
                    </>
                  )}
                </section>
                <aside className="panel opponent-panel">
                  <div>
                    <div className="eyebrow">
                      {game.offline ? "Твой результат" : "На арене"}
                    </div>
                    <strong>{user?.username || "Ты"}</strong>
                  </div>
                  <div className="score-line">
                    <span>Верно</span>
                    <strong>
                      {game.score} / {MODES[game.config.mode].count}
                    </strong>
                  </div>
                  <div className="score-line">
                    <span>Отвечено</span>
                    <strong>{game.answers.length}</strong>
                  </div>
                  {game.opponent && (
                    <>
                      <div className="opponent-name">
                        <Swords size={17} /> {game.opponent.username}
                        <small>{game.opponent.rating} MR</small>
                      </div>
                      <div className="score-line">
                        <span>Верно у соперника</span>
                        <strong>{game.opponent.score}</strong>
                      </div>
                      <p className="muted">
                        {game.opponent.done
                          ? "Соперник завершил матч"
                          : `${game.opponent.answered} ответов принято`}
                      </p>
                    </>
                  )}
                  <p className="muted game-note">
                    {grand
                      ? "Можно переключаться между заданиями. Каждый ответ принимается один раз."
                      : "Один ответ на вопрос. Когда время истечёт, появится следующий."}
                  </p>
                </aside>
              </div>
            </section>
          )}
          {page === "game" && result && myResult && (
            <section className={`result-panel outcome-${myResult.outcome}`}>
              <div className="result-kicker" aria-hidden="true">
                RESULT / {myResult.outcome === "win" ? "VICTORY" : "NEXT LEVEL"}
              </div>
              <div className="result-slash" aria-hidden="true" />
              <div className="result-art" aria-hidden="true">
                <img src="/art/arena-portrait.png" alt="" />
              </div>
              <div className="eyebrow">
                {game.offline
                  ? "ТРЕНИРОВКА"
                  : result.ranked
                    ? "РЕЙТИНГОВЫЙ МАТЧ"
                    : "ПРИВАТНЫЙ МАТЧ"}
              </div>
              <h1>{outcomeTitle[myResult.outcome]}</h1>
              <div className="result-score">
                {myResult.score}
                <span>/{result.questions.length}</span>
              </div>
              <p>
                {elapsedText(myResult.elapsed)} ·{" "}
                {myResult.forfeit
                  ? "Матч завершён досрочно"
                  : "Точность и скорость решают"}
              </p>
              {result.ranked && (
                <div className="result-rating">
                  {myResult.delta > 0 ? "+" : ""}
                  {myResult.delta} MR{" "}
                  <span>
                    → {myResult.rating} · {tierFor(myResult.rating).name}
                  </span>
                </div>
              )}
              {result.players
                .filter((p) => p.id !== myResult.id)
                .map((p) => (
                  <p key={p.id}>
                    Соперник {p.username}: {p.score}/{result.questions.length} ·{" "}
                    {elapsedText(p.elapsed)}
                    {p.forfeit ? " · Сдался" : ""}
                  </p>
                ))}
              <div className="hero-actions">
                <button
                  className="button primary"
                  onClick={() => {
                    setGame(null);
                    practice.current = null;
                    gameId.current = null;
                    navigate("arena");
                    openMode(result.config.mode);
                  }}
                >
                  Ещё раунд <ArrowRight size={15} />
                </button>
                <button
                  className="button secondary"
                  onClick={() => {
                    setGame(null);
                    practice.current = null;
                    gameId.current = null;
                    navigate("arena");
                  }}
                >
                  На главную
                </button>
              </div>
              <details className="answer-review">
                <summary>Разбор всех заданий</summary>
                {result.questions.map((q, i) => {
                  const a = myResult.answers.find((a) => a.index === i);
                  return (
                    <article
                      key={i}
                      className={`review-item ${a?.correct ? "correct" : "incorrect"}`}
                    >
                      <strong>
                        {i + 1}. {q.prompt}
                      </strong>
                      <p>
                        Твой ответ: {a?.value || "Нет ответа"} · Верно:{" "}
                        {q.answer}
                      </p>
                      <p>{q.explanation}</p>
                    </article>
                  );
                })}
              </details>
            </section>
          )}
          <footer className="footer">
            <span>MATHVS / MATCH YOUR MIND</span>
            <button className="text-button" onClick={() => setModal("rules")}>
              Правила арены <ArrowUpRight size={12} />
            </button>
            <span>ТОЧНОСТЬ. СКОРОСТЬ. ХАРАКТЕР.</span>
          </footer>
        </main>
      </div>
      {modal === "auth" && (
        <Modal
          title={
            authAction === "register" ? "Забери свой ник." : "С возвращением."
          }
          onClose={closeModal}
        >
          <div className="segmented">
            <button
              type="button"
              className={authAction === "register" ? "active" : ""}
              onClick={() => {
                setAuthAction("register");
                setError("");
              }}
            >
              Регистрация
            </button>
            <button
              type="button"
              className={authAction === "login" ? "active" : ""}
              onClick={() => {
                setAuthAction("login");
                setError("");
              }}
            >
              Вход
            </button>
          </div>
          <form onSubmit={authenticate}>
            <label className="form-field">
              <span className="field-label">Никнейм</span>
              <input
                name="username"
                required
                minLength={3}
                maxLength={20}
                autoComplete="username"
                placeholder="Твой игровой ник"
              />
            </label>
            <label className="form-field">
              <span className="field-label">Пароль · минимум 8 символов</span>
              <input
                name="password"
                type="password"
                required
                minLength={8}
                maxLength={128}
                autoComplete={
                  authAction === "register"
                    ? "new-password"
                    : "current-password"
                }
              />
            </label>
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            <button className="button primary full-width" disabled={busy}>
              {busy
                ? "Подождите…"
                : authAction === "register"
                  ? "Создать аккаунт"
                  : "Войти"}
              <ArrowRight size={16} />
            </button>
          </form>
          <p className="muted">
            Один аккаунт, общий рейтинг, все дисциплины. Начальный рейтинг —
            1000 MR.
          </p>
        </Modal>
      )}
      {modal === "config" && (
        <Modal
          title={`${MODES[config.mode].name} / Настройка`}
          onClose={closeModal}
        >
          <label className="form-field">
            <span className="field-label">Дисциплина</span>
            <select
              value={config.discipline}
              onChange={(e) =>
                setConfig((c) => ({ ...c, discipline: e.target.value }))
              }
            >
              {Object.entries(DISCIPLINES).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <span className="field-label">Формат игры</span>
          <div className="segmented">
            {[
              ["offline", "Соло"],
              ["ranked", "Рейтинг"],
              ["create", "С другом"],
            ].map(([id, name]) => (
              <button
                key={id}
                aria-pressed={
                  network === id || (id === "create" && network === "join")
                }
                onClick={() => setNetwork(id)}
              >
                {name}
              </button>
            ))}
          </div>
          {config.mode === "long" && (
            <div className="form-field">
              <span className="field-label">На каждую задачу</span>
              <div className="segmented">
                {[30, 60].map((n) => (
                  <button
                    key={n}
                    aria-pressed={config.duration === n}
                    onClick={() => setConfig((c) => ({ ...c, duration: n }))}
                  >
                    {n} секунд
                  </button>
                ))}
              </div>
            </div>
          )}
          {["create", "join"].includes(network) && (
            <div className="form-field">
              <div className="segmented">
                <button
                  aria-pressed={network === "create"}
                  onClick={() => setNetwork("create")}
                >
                  Создать комнату
                </button>
                <button
                  aria-pressed={network === "join"}
                  onClick={() => setNetwork("join")}
                >
                  Ввести код
                </button>
              </div>
              {network === "join" && (
                <label className="form-field">
                  <span className="field-label">Код комнаты</span>
                  <input
                    aria-label="Код комнаты"
                    value={roomCode}
                    maxLength={6}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                    placeholder="A1B2C3"
                  />
                </label>
              )}
            </div>
          )}
          <p className="muted">
            {network === "offline"
              ? "Тренировка без соперника. Работает офлайн после первого открытия сайта. Рейтинг не меняется."
              : network === "ranked"
                ? "Подберём игрока с близким рейтингом и такими же настройками. Сначала верные ответы, затем скорость."
                : "Комната для двух игроков. Настройки задаёт создатель комнаты. Рейтинг не меняется."}
          </p>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <button
            className="button primary"
            disabled={
              busy ||
              !!activeGame ||
              (network === "join" && roomCode.length !== 6) ||
              (network !== "offline" && user && !connected)
            }
            onClick={startGame}
          >
            {busy
              ? "Подождите…"
              : network === "offline"
                ? "Начать тренировку"
                : network === "ranked"
                  ? "Найти соперника"
                  : network === "create"
                    ? "Создать комнату"
                    : "Присоединиться"}
            <ArrowRight size={16} />
          </button>
        </Modal>
      )}
      {modal === "rules" && (
        <Modal title="Правила арены" onClose={closeModal}>
          <div className="rules-content">
            <h3>Три способа победить</h3>
            <ul className="rules-list">
              <li>
                <strong>Блиц:</strong> 10 вопросов с вариантами ответа, по 10
                секунд на вопрос. Ответ ускоряет переход к следующему вопросу.
              </li>
              <li>
                <strong>Long Call:</strong> 2 задачи с числовым ответом. По 30
                или 60 секунд на каждую — выбираешь до матча.
              </li>
              <li>
                <strong>Grand Tour:</strong> 8 тестовых вопросов и 3 задачи.
                Общие 5 минут, свободный порядок решения.
              </li>
            </ul>
            <h3>Сначала точность, затем скорость</h3>
            <p className="muted">
              Один ответ на задание. Побеждает тот, кто ответил верно на большее
              число заданий. При равном счёте побеждает более быстрый игрок.
              Разница менее 10 мс — ничья: рейтинг обоих не меняется. Одинаковые
              задания для обоих, время считает сервер.
            </p>
            <h3>Рейтинг и уровни</h3>
            <p className="muted">
              Начало — 1000 MR, изменения по Elo с K=32. Победитель получает
              столько же рейтинга, сколько теряет проигравший. 6 тиров от Bronze
              до Master. Опыт и уровни растут за рейтинговые матчи. Приватные
              комнаты и тренировки не меняют рейтинг.
            </p>
            <h3>Связь и ответы</h3>
            <p className="muted">
              Для онлайн-игры нужен аккаунт. При потере связи есть 20 секунд на
              возвращение; таймер продолжает идти. После этого засчитывается
              поражение. Числовой ответ: целое, десятичное с точкой/запятой или
              дробь. Ответы и объяснения открываются после завершения обоими
              игроками.
            </p>
          </div>
        </Modal>
      )}
      {modal === "forfeit" && (
        <Modal title="Завершить матч?" onClose={closeModal}>
          <p className="muted">
            {game?.offline
              ? "Текущая тренировка завершится без сохранения результата."
              : "Будет засчитано поражение. В рейтинговом матче изменится рейтинг."}
          </p>
          <button
            className="button danger"
            onClick={async () => {
              setError("");
              try {
                if (game.offline) {
                  practice.current = null;
                  setGame(null);
                  navigate("arena");
                } else await send("match:forfeit", { matchId: game.id });
                closeModal();
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            Завершить
          </button>
          <button className="button secondary" onClick={closeModal}>
            Продолжить играть
          </button>
          {error && <p className="error-message">{error}</p>}
        </Modal>
      )}
      {queue.status !== "idle" && !modal && (
        <Modal
          title={
            queue.status === "room"
              ? "Вызов брошен."
              : "Ищем достойного соперника."
          }
          onClose={() => {
            send("queue:cancel").catch((e) => setError(e.message));
          }}
        >
          <div className="queue-animation" />
          {queue.status === "room" ? (
            <>
              <p className="muted center">
                Передай код другу. Вход через «С другом → Ввести код».
              </p>
              <div className="room-code">{queue.code}</div>
              <button
                className="button secondary"
                onClick={() =>
                  navigator.clipboard
                    ?.writeText(queue.code)
                    .then(() => setError("Код скопирован."))
                    .catch(() => setError("Скопируй код вручную."))
                }
              >
                Скопировать код
              </button>
            </>
          ) : (
            <p className="muted center">
              {MODES[queue.mode]?.name} · {DISCIPLINES[queue.discipline]}
              <br />
              Ожидаем реального игрока. Можно пригласить друга в приватную
              комнату.
            </p>
          )}
          <button
            className="button secondary"
            onClick={() =>
              send("queue:cancel").catch((e) => setError(e.message))
            }
          >
            Отменить
          </button>
          {error && <p className="error-message">{error}</p>}
        </Modal>
      )}
    </>
  );
}
function History({ matches, userId }) {
  if (!matches.length)
    return (
      <div className="panel empty-state">
        Здесь появятся твои завершённые матчи.
      </div>
    );
  return (
    <div className="history-list">
      {matches.map((m) => {
        const me = m.players.find((p) => p.id === userId);
        return (
          <div key={m.id} className="history-item">
            <div>
              <strong>{MODES[m.config.mode].name}</strong>
              <br />
              <small>
                {DISCIPLINES[m.config.discipline]} ·{" "}
                {new Date(m.endedAt).toLocaleDateString("ru")}
              </small>
            </div>
            <span>
              {me?.score}/{m.questions.length} · {elapsedText(me?.elapsed || 0)}
            </span>
            <span className={`history-outcome ${me?.outcome}`}>
              {m.ranked
                ? `${me?.delta > 0 ? "+" : ""}${me?.delta} MR`
                : me?.outcome === "practice"
                  ? "Соло"
                  : "Приватный"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
if (import.meta.env.PROD && "serviceWorker" in navigator)
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("/sw.js").catch(() => {}),
  );
