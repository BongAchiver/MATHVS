import React from "react";

export default function PageBanner({ kind, title, subtitle, children, user }) {
  return (
    <header className={`page-banner banner-${kind}`}>
      <div className="banner-grid" aria-hidden="true" />
      <div className="banner-word" aria-hidden="true">
        {kind === "rating" ? "RANK" : "PLAYER"}
      </div>
      <div className="banner-copy">
        <div className="eyebrow">
          {kind === "rating"
            ? "THE LEADERBOARD / ДОРОГА К ВЕРШИНЕ"
            : "PLAYER RECORD / ЛИЧНОЕ ДЕЛО"}
        </div>
        <h1 className="page-title">{title}</h1>
        <p className="banner-subtitle">{subtitle}</p>
        {children}
      </div>
      <div className="banner-emblem" aria-hidden="true">
        <span className="emblem-label">
          {kind === "rating" ? "THE TOP" : "YOUR MOVE"}
        </span>
        <strong>
          {kind === "rating"
            ? "01"
            : user?.username.slice(0, 2).toUpperCase() || "M"}
        </strong>
        <span className="emblem-caption">
          {kind === "rating"
            ? "ВЕРШИНА ЖДЁТ"
            : `${user?.tier || "UNRANKED"} / LV.${user?.level || 1}`}
        </span>
      </div>
      <div className="banner-stripe" aria-hidden="true" />
    </header>
  );
}
