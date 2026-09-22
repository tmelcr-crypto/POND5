/** True on phones/tablets: used to scale quality (grass count, shadow maps, pixel ratio). */
export const isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
