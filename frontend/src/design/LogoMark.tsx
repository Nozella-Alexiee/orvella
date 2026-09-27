import { useEffect, useId, useRef } from 'react';
import { motion } from '../fx';

/** Tanda logo Orvella: bola marigold, cincin miring, dan Pip yang mengorbit (lebih cepat saat di-hover). */
export function LogoMark({ size = 34 }: { size?: number }) {
  const uid = useId().replace(/:/g, '');
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const pip = svg.querySelector('.lm-pip') as SVGCircleElement, back = svg.querySelector('.lm-back')!, front = svg.querySelector('.lm-front')!;
    let t = .7, speed = 1, target = 1, raf = 0, last = 0;
    const a = -18 * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    const place = () => {
      const x0 = 55 * Math.cos(t), y0 = 14.5 * Math.sin(t);
      const lay = Math.sin(t) > 0 ? front : back;
      if (pip.parentNode !== lay) lay.appendChild(pip);
      pip.setAttribute('transform', `translate(${(x0 * ca - y0 * sa).toFixed(2)} ${(x0 * sa + y0 * ca).toFixed(2)}) scale(${(1 + Math.sin(t) * .16).toFixed(3)})`);
    };
    const loop = (now: number) => {
      const dt = Math.min(.05, (now - last) / 1000 || .016); last = now;
      speed += (target - speed) * .08;
      if (motion() === 'full' && !document.hidden) { t += dt * (Math.PI * 2 / 7) * speed; place(); }
      raf = requestAnimationFrame(loop);
    };
    place(); raf = requestAnimationFrame(loop);
    const host = svg.closest('.logo') || svg;
    const fast = () => (target = 5), slow = () => (target = 1);
    host.addEventListener('pointerenter', fast); host.addEventListener('pointerleave', slow);
    return () => { cancelAnimationFrame(raf); host.removeEventListener('pointerenter', fast); host.removeEventListener('pointerleave', slow); };
  }, []);
  return (
    <span className="logo-mark" style={{ width: size, height: size }} aria-hidden="true">
      <svg ref={svgRef} viewBox="-62 -62 124 124" focusable="false">
        <defs>
          <radialGradient id={`lmg${uid}`} cx="36%" cy="30%" r="80%"><stop offset="0" stopColor="#FFF3C9" /><stop offset=".5" stopColor="#FFC53D" /><stop offset="1" stopColor="#F28C00" /></radialGradient>
          <clipPath id={`lmc${uid}`}><rect x="-70" y="0" width="140" height="70" /></clipPath>
        </defs>
        <g transform="rotate(-18)"><ellipse className="lm-ring lm-ring-back" rx="55" ry="14.5" /></g>
        <g className="lm-back" />
        <circle r="32" fill={`url(#lmg${uid})`} />
        <ellipse className="lm-shine" cx="-12" cy="-16" rx="9.5" ry="5.2" transform="rotate(-35 -12 -16)" />
        <g transform="rotate(-18)"><ellipse className="lm-ring" rx="55" ry="14.5" clipPath={`url(#lmc${uid})`} /></g>
        <g className="lm-front"><circle className="lm-pip" r="8.5" /></g>
      </svg>
    </span>
  );
}
