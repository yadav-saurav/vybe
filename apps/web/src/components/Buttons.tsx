import type { ButtonHTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';
import { Icon } from './Icon';
import s from './Buttons.module.css';

/** Primary pill (Play / Preview / Shuffle on album headers). */
export function PillButton({ icon, children, variant = 'key', className, ...rest }: { icon?: string; children: ReactNode; variant?: 'key' | 'contrast' | 'soft' } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={clsx(s.pill, s[variant], className)} {...rest}>{icon && <Icon name={icon} size={16} />}<span>{children}</span></button>;
}

/** Circular icon button (the "···" button top-right of headers, love/add buttons). */
export function CircleButton({ icon, label, size = 32, active, className, ...rest }: { icon: string; label: string; size?: number; active?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button aria-label={label} title={label} className={clsx(s.circle, active && s.active, className)} style={{ width: size, height: size }} {...rest}>
      <Icon name={icon} size={Math.round(size * 0.55)} />
    </button>
  );
}

/** Bare icon button used inside rows / player. */
export function IconButton({ icon, label, size = 20, active, className, ...rest }: { icon: string; label: string; size?: number; active?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button aria-label={label} title={label} aria-pressed={active} className={clsx(s.icon, active && s.iconActive, className)} {...rest}><Icon name={icon} size={size} /></button>;
}

export function ExplicitBadge() {
  return <span className={s.explicit} aria-label="Explicit" title="Explicit">E</span>;
}
