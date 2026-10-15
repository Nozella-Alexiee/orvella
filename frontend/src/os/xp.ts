/* XP terbang: chip "+5 XP" melayang dari tombol ke chip XP di menu bar, lalu angkanya ikut naik. */
import { flyTo, motion, pop, sound, ticker } from '../fx';
import { emit } from './bus';

export function flyXp(from: Element | null | undefined, amount: number, xpWeek?: number) {
  if (amount <= 0) return;
  emit('xp', { amount, from: from || null });
  const dst = document.querySelector<HTMLElement>('[data-xp]');
  const land = () => {
    if (!dst) return;
    ticker(dst, xpWeek ?? (Number(dst.textContent) || 0) + amount);
    pop(dst.closest('.os-mb-xp') || dst);
    sound('tick');
  };
  if (!from || !dst || motion() === 'off') { land(); return; }
  const r = from.getBoundingClientRect();
  const chip = document.createElement('span');
  chip.className = 'os-xp-chip';
  chip.textContent = `+${amount} XP`;
  Object.assign(chip.style, { left: r.left + r.width / 2 - 34 + 'px', top: r.top + r.height / 2 - 14 + 'px' });
  document.body.appendChild(chip);
  void flyTo(chip, dst, { dur: 850 }).then(land);
  chip.remove();
}
