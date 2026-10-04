import { useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Radio,
  Trophy,
  Zap,
} from "lucide-react";
import { effect } from "./audio.js";
const modes = [
  {
    id: "blitz",
    number: "01",
    label: "BLITZ",
    name: "Блиц",
    tag: "РЕАКЦИЯ",
    description:
      "Десять вопросов. Ни секунды на сомнения. Знания решают — скорость побеждает.",
    time: "10 СЕК / ВОПРОС",
    count: "10 ВОПРОСОВ",
  },
  {
    id: "long",
    number: "02",
    label: "LONG CALL",
    name: "Long Call",
    tag: "КОНЦЕНТРАЦИЯ",
    description:
      "Две задачи. Один верный ход. Найди решение и введи ответ раньше соперника.",
    time: "30 / 60 СЕК",
    count: "2 ЗАДАЧИ",
  },
  {
    id: "grand",
    number: "03",
    label: "GRAND TOUR",
    name: "Grand Tour",
    tag: "ВЫНОСЛИВОСТЬ",
    description:
      "Тест и три задачи. Пять минут, чтобы собрать свой идеальный раунд.",
    time: "5 МИНУТ",
    count: "8 + 3 ЗАДАНИЯ",
  },
];
export default function Arena({
  disabled,
  user,
  stats,
  onMode,
  onRules,
  children,
}) {
  const [selected, setSelected] = useState("blitz");
  const stage = useRef();
  const mode = modes.find((m) => m.id === selected);
  function select(id) {
    if (id !== selected) {
      setSelected(id);
      effect("select");
    }
  }
  function keyboard(e) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const buttons = [...e.currentTarget.querySelectorAll("button")];
    let i = buttons.indexOf(document.activeElement);
    i =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? 2
          : (i + (e.key === "ArrowDown" ? 1 : -1) + 3) % 3;
    buttons[i].focus();
  }
  return (
    <>
      <section
        className="arena-stage"
        ref={stage}
        onPointerMove={(e) => {
          if (
            e.pointerType !== "mouse" ||
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
          )
            return;
          const rect = e.currentTarget.getBoundingClientRect();
          stage.current.style.setProperty(
            "--pointer-x",
            `${((e.clientX - rect.left) / rect.width - 0.5) * 14}px`,
          );
          stage.current.style.setProperty(
            "--pointer-y",
            `${((e.clientY - rect.top) / rect.height - 0.5) * 10}px`,
          );
        }}
        onPointerLeave={() => {
          stage.current.style.setProperty("--pointer-x", "0px");
          stage.current.style.setProperty("--pointer-y", "0px");
        }}
      >
        <div className="stage-word" aria-hidden="true">
          <span>MATH</span>
          <span>BATTLE</span>
        </div>
        <div className="stage-slash slash-one" aria-hidden="true" />
        <div className="stage-slash slash-two" aria-hidden="true" />
        <div className="stage-slash slash-three" aria-hidden="true" />
        <div className="stage-grid" aria-hidden="true" />
        <header className="arena-header">
          <div className="eyebrow">COMPETITIVE MATHEMATICS / ТВОЙ ХОД</div>
          <h1 className="arena-heading">
            ДУМАЙ
            <br />
            БЫСТРЕЕ.
          </h1>
          <p className="arena-subtitle">Твой следующий ход.</p>
        </header>
        <figure className="arena-portrait" aria-hidden="true">
          <img
            src="/art/arena-portrait.png"
            alt=""
            width="1024"
            height="1536"
            fetchPriority="high"
          />
          <figcaption className="portrait-caption">
            MATHVS / PLAYER ONE
          </figcaption>
        </figure>
        <nav
          className="battle-menu"
          aria-label="Выбор режима"
          onKeyDown={keyboard}
        >
          {modes.map((m) => (
            <button
              key={m.id}
              className={`mode-card ${m.id} ${selected === m.id ? "selected" : ""}`}
              disabled={disabled}
              aria-label={`${m.label} — ${m.name}. ${m.tag}`}
              onPointerEnter={() => select(m.id)}
              onFocus={() => select(m.id)}
              onClick={() => onMode(m.id)}
            >
              <span className="menu-pointer" aria-hidden="true">
                ▶
              </span>
              <span className="mode-number">{m.number}</span>
              <span className="mode-title">{m.label}</span>
              <span className="mode-tag">{m.tag}</span>
            </button>
          ))}
        </nav>
        <section className="mode-brief" key={selected} aria-live="polite">
          <div className="brief-label">
            <Zap size={13} /> {mode.tag} / MODE {mode.number}
          </div>
          <h2 className="brief-name">{mode.name}</h2>
          <p className="brief-description">{mode.description}</p>
          <div className="brief-meta">
            <span>{mode.time}</span>
            <span>{mode.count}</span>
            <span>ONLINE / SOLO</span>
          </div>
          <button
            className="button primary launch-button"
            disabled={disabled}
            onClick={() => onMode(selected)}
          >
            Начать раунд <ArrowRight size={17} />
          </button>
        </section>
        <div className="arena-controls">
          <button className="button secondary" onClick={onRules}>
            <BookOpen size={15} /> Как играть
          </button>
          <span className="control-hint">↑ ↓ ВЫБОР · ENTER СТАРТ</span>
        </div>
        <div className="stage-status">
          <span>
            <Radio size={12} /> {stats.online} В СЕТИ
          </span>
          <span>
            <Trophy size={12} />{" "}
            {user
              ? `${user.rating} MR / ${user.tier.toUpperCase()}`
              : "ТВОЁ МЕСТО НА АРЕНЕ ЖДЁТ"}
          </span>
          <span>МАТАНАЛИЗ · ЛИНАЛ · ДИСКРЕТНАЯ</span>
        </div>
      </section>
      <section className="arena-support">
        <div className="section-heading">
          <h2>За пределами раунда</h2>
          <span>
            RANK / PROGRESS <ArrowUpRight size={12} />
          </span>
        </div>
        {children}
      </section>
    </>
  );
}
