import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { effect } from "./audio.js";

// The cover holds at its final frame until React commits the new page.
// Animation events, rather than wall-clock timers, also work under CPU load.
export function useSceneNavigation(initialPage = "arena") {
  const [page, setPage] = useState(initialPage);
  const [phase, setPhase] = useState(null);
  const current = useRef(initialPage);
  const requested = useRef(initialPage);
  const phaseRef = useRef(null);
  const changePhase = useCallback((next) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);
  const commit = useCallback((destination) => {
    current.current = destination;
    setPage(destination);
  }, []);
  const jumpTo = useCallback(
    (destination) => {
      requested.current = destination;
      changePhase(null);
      commit(destination);
    },
    [changePhase, commit],
  );
  const navigate = useCallback(
    (destination) => {
      if (!phaseRef.current && destination === current.current) return;
      requested.current = destination;
      if (
        window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
        document.hidden
      ) {
        jumpTo(destination);
        return;
      }
      if (!phaseRef.current) {
        effect("transition");
        changePhase("cover");
      }
    },
    [changePhase, jumpTo],
  );
  const advance = useCallback(
    (event) => {
      if (event.target !== event.currentTarget) return;
      if (
        phaseRef.current === "cover" &&
        event.animationName === "wipe-cover"
      ) {
        flushSync(() => {
          commit(requested.current);
          changePhase("uncover");
        });
      } else if (
        phaseRef.current === "uncover" &&
        event.animationName === "wipe-uncover"
      ) {
        // A click during the exit starts a fresh cover; the latest request wins.
        changePhase(requested.current === current.current ? null : "cover");
      }
    },
    [changePhase, commit],
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const settle = () => {
      if (phaseRef.current && (media.matches || document.hidden))
        jumpTo(requested.current);
    };
    media.addEventListener("change", settle);
    document.addEventListener("visibilitychange", settle);
    return () => {
      media.removeEventListener("change", settle);
      document.removeEventListener("visibilitychange", settle);
    };
  }, [jumpTo]);
  return { page, navigate, jumpTo, phase, advance };
}
