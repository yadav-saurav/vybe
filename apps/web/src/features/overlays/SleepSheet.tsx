import clsx from 'clsx';
import { useUI } from '../../stores/ui';
import { usePlayer } from '../../stores/player';
import { Sheet } from './Sheet';
import s from './SleepSheet.module.css';

const OPTIONS: { label: string; mode: number | 'end' }[] = [
  { label: '15 minutes', mode: 15 }, { label: '30 minutes', mode: 30 }, { label: '45 minutes', mode: 45 },
  { label: '1 hour', mode: 60 }, { label: 'After this song', mode: 'end' },
];

/** Sleep timer picker. The one place the timer is set; Now Playing shows its countdown chip. */
export function SleepSheet() {
  const open = useUI((u) => u.sleepOpen);
  const close = () => useUI.getState().setSleepOpen(false);
  const endsAt = usePlayer((p) => p.sleepEndsAt);
  const atEnd = usePlayer((p) => p.sleepAtEnd);
  const active = endsAt !== null || atEnd;
  const pick = (mode: number | 'end' | null, label: string) => {
    usePlayer.getState().setSleep(mode);
    useUI.getState().toast(mode === null ? 'Sleep Timer Off' : mode === 'end' ? 'Stopping after this song' : `Stopping in ${label}`);
    close();
  };
  return (
    <Sheet open={open} onClose={close} labelledBy="sleep-title" className={s.sheet}>
      <div className={s.wrap}>
        <h2 id="sleep-title" className={s.title}>Sleep Timer</h2>
        <p className={s.sub}>Music fades out and stops on its own.</p>
        <ul className={s.list}>
          {OPTIONS.map((o) => (
            <li key={String(o.mode)}>
              <button className={clsx(s.opt, ((o.mode === 'end' && atEnd) || (o.mode !== 'end' && endsAt !== null && Math.abs((endsAt - Date.now()) / 60000 - (o.mode as number)) < 1)) && s.optOn)} onClick={() => pick(o.mode, o.label)}>{o.label}</button>
            </li>
          ))}
        </ul>
        {active && <button className={s.off} onClick={() => pick(null, '')}>Turn Off</button>}
      </div>
    </Sheet>
  );
}
