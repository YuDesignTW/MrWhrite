import React, { cloneElement, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Render outside scroll panels so explanations never get clipped by navigation.
export function Tooltip({ content, children, side = "bottom" }) {
  const id = useId();
  const anchor = useRef(null);
  const timer = useRef(null);
  const [position, setPosition] = useState(null);
  const hide = () => {
    clearTimeout(timer.current);
    setPosition(null);
  };
  const show = () => {
    clearTimeout(timer.current);
    if (!anchor.current || !content) return;
    const r = anchor.current.getBoundingClientRect();
    const width = Math.min(248, window.innerWidth - 24);
    const right = side === "right" && r.right + width + 20 < window.innerWidth;
    setPosition({
      width,
      left: Math.max(
        12,
        Math.min(window.innerWidth - width - 12, right ? r.right + 10 : r.left),
      ),
      top: Math.max(
        12,
        Math.min(window.innerHeight - 100, right ? r.top : r.bottom + 8),
      ),
    });
  };
  const leave = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(hide, 120);
  };
  useEffect(() => {
    const escape = (e) => {
      if (e.key === "Escape") hide();
    };
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", hide);
    window.addEventListener("scroll", hide, true);
    return () => {
      clearTimeout(timer.current);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", hide);
      window.removeEventListener("scroll", hide, true);
    };
  }, []);
  const call = (name, action) => (e) => {
    children.props[name]?.(e);
    action(e);
  };
  return (
    <>
      {cloneElement(children, {
        ref: anchor,
        "aria-describedby": position ? id : children.props["aria-describedby"],
        onPointerEnter: call("onPointerEnter", (e) => {
          if (e.pointerType !== "touch") {
            clearTimeout(timer.current);
            timer.current = setTimeout(show, 350);
          }
        }),
        onPointerLeave: call("onPointerLeave", leave),
        onFocus: call("onFocus", show),
        onBlur: call("onBlur", hide),
      })}
      {position &&
        createPortal(
          <span
            id={id}
            role="tooltip"
            className="ui-tooltip"
            style={position}
            onPointerEnter={() => clearTimeout(timer.current)}
            onPointerLeave={leave}
          >
            {content}
          </span>,
          document.body,
        )}
    </>
  );
}
