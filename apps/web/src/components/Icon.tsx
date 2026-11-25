import type { ReactElement, SVGProps } from 'react';

/** Vybe's own icon set (24×24 grid, drawn for this project). */
const paths: Record<string, ReactElement> = {
  search: <><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M15.5 15.5 21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></>,
  home: <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />,
  new: <><rect x="4" y="4" width="7" height="7" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.8" /><rect x="13" y="4" width="7" height="7" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.8" /><rect x="4" y="13" width="7" height="7" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.8" /><rect x="13" y="13" width="7" height="7" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.8" /></>,
  radio: <><circle cx="12" cy="12" r="2.2" fill="currentColor" /><path d="M8.2 8.2a5.4 5.4 0 0 0 0 7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6M5.4 5.4a9.3 9.3 0 0 0 0 13.2M18.6 5.4a9.3 9.3 0 0 1 0 13.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></>,
  artist: <><circle cx="12" cy="8.5" r="3.8" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M4.5 20c.8-3.8 3.8-6 7.5-6s6.7 2.2 7.5 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></>,
  album: <><rect x="3.5" y="3.5" width="17" height="17" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="12" cy="12" r="1" fill="currentColor" /></>,
  note: <path d="M9 18.5V6.2l10-2.2v12.3M9 18.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Zm10-2.2a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM9 9.6l10-2.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />,
  playlist: <path d="M4 6h12M4 11h12M4 16h7M15 19.5V13l5-1.2M15 19.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  sparkle: <path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7Zm6.5 11.5c.3 2 1.2 2.9 3 3.2-1.8.3-2.7 1.2-3 3.3-.3-2.1-1.2-3-3-3.3 1.8-.3 2.7-1.2 3-3.2Z" fill="currentColor" />,
  play: <path d="M7 4.8v14.4a1 1 0 0 0 1.5.86l12-7.2a1 1 0 0 0 0-1.72l-12-7.2A1 1 0 0 0 7 4.8Z" fill="currentColor" />,
  pause: <><rect x="6" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" /><rect x="14" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" /></>,
  next: <path d="M3 6.5v11a.8.8 0 0 0 1.25.66L12 12.9v4.6a.8.8 0 0 0 1.25.66l8.2-5.5a.8.8 0 0 0 0-1.32l-8.2-5.5A.8.8 0 0 0 12 6.5v4.6L4.25 5.84A.8.8 0 0 0 3 6.5Z" fill="currentColor" />,
  previous: <path d="M21 6.5v11a.8.8 0 0 1-1.25.66L12 12.9v4.6a.8.8 0 0 1-1.25.66l-8.2-5.5a.8.8 0 0 1 0-1.32l8.2-5.5A.8.8 0 0 1 12 6.5v4.6l7.75-5.26A.8.8 0 0 1 21 6.5Z" fill="currentColor" />,
  shuffle: <path d="M3 7h3.2c2 0 3.2 1 4.3 2.8l3 4.4c1.1 1.8 2.3 2.8 4.3 2.8H20M3 17h3.2c1.4 0 2.4-.5 3.2-1.4M20 7h-2.2c-1.4 0-2.4.5-3.2 1.4M17.5 4.5 20 7l-2.5 2.5M17.5 14.5 20 17l-2.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  repeat: <path d="M4 11V9.5A3.5 3.5 0 0 1 7.5 6H19M16.5 3.5 19 6l-2.5 2.5M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H5M7.5 20.5 5 18l2.5-2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  'repeat-one': <><path d="M4 11V9.5A3.5 3.5 0 0 1 7.5 6H19M16.5 3.5 19 6l-2.5 2.5M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H5M7.5 20.5 5 18l2.5-2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><path d="M11.2 10.2 12.6 9.4v5.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></>,
  'volume-0': <path d="M4 9.5h3l4.5-4v13l-4.5-4H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1ZM16 9.5l5 5M21 9.5l-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  'volume-1': <path d="M4 9.5h3l4.5-4v13l-4.5-4H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1ZM15.2 9a4.2 4.2 0 0 1 0 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  'volume-2': <path d="M4 9.5h3l4.5-4v13l-4.5-4H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1ZM15.2 9a4.2 4.2 0 0 1 0 6M18 6.2a8 8 0 0 1 0 11.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  queue: <path d="M8.5 6H20M8.5 12H20M8.5 18H20M4.5 6h.01M4.5 12h.01M4.5 18h.01" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />,
  lyrics: <path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5h-7l-4.5 3.5V17H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5ZM8 9.5h8M8 13h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  more: <><circle cx="5.5" cy="12" r="1.7" fill="currentColor" /><circle cx="12" cy="12" r="1.7" fill="currentColor" /><circle cx="18.5" cy="12" r="1.7" fill="currentColor" /></>,
  plus: <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  close: <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />,
  heart: <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />,
  'heart-fill': <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z" fill="currentColor" />,
  'chevron-right': <path d="m9.5 5.5 6.5 6.5-6.5 6.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />,
  'chevron-left': <path d="m14.5 5.5-6.5 6.5 6.5 6.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />,
  'chevron-down': <path d="m5.5 9.5 6.5 6.5 6.5-6.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />,
  'play-next': <path d="M4 6h10M4 11h10M4 16h6M15 13.5v6.5l5-3.25z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  'play-later': <path d="M4 6h10M4 11h10M4 16h6M17 13v7M13.5 16.5h7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />,
  share: <path d="M12 3.5v11M8 7.5l4-4 4 4M6 11H5a1 1 0 0 0-1 1v7.5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V12a1 1 0 0 0-1-1h-1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  trash: <path d="M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5l1 13h9l1-13M10 10.5v6M14 10.5v6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />,
  user: <><circle cx="12" cy="8" r="3.5" fill="currentColor" /><path d="M5 20c.6-3.8 3.4-5.8 7-5.8s6.4 2 7 5.8z" fill="currentColor" /></>,
  menu: <path d="M4 8h16M4 16h16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />,
  explicit: <><rect x="3" y="3" width="18" height="18" rx="3" fill="currentColor" /><path d="M15 7.5H9.5v9H15M9.5 12H14" fill="none" stroke="var(--explicit-fg, #fff)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></>,
  airplay: <path d="M7 17H5a1.5 1.5 0 0 1-1.5-1.5v-10A1.5 1.5 0 0 1 5 4h14a1.5 1.5 0 0 1 1.5 1.5v10A1.5 1.5 0 0 1 19 17h-2M12 14l5 6H7z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />,
  infinity: <path d="M12 12c-2-2.6-3.5-4-5.5-4a4 4 0 0 0 0 8c2 0 3.5-1.4 5.5-4Zm0 0c2 2.6 3.5 4 5.5 4a4 4 0 0 0 0-8c-2 0-3.5 1.4-5.5 4Z" fill="none" stroke="currentColor" strokeWidth="1.8" />,
  'arrow-up-right': <path d="M7 17 17 7M9 7h8v8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  info: <><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M12 11v5.5M12 7.6v.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></>,
  star: <path d="m12 3.8 2.5 5.1 5.6.8-4 4 .9 5.6-5-2.7-5 2.7.9-5.6-4-4 5.6-.8z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />,
  logo: <path d="M3 6.5 8.2 18h2.1L15.5 6.5h-2.4L9.3 15.2 5.4 6.5zm13.2 0V18h2.1V6.5zM17.25 2.5a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8Z" fill="currentColor" />,
  wave: <path d="M4 12h1.5M7.5 8v8M11 5v14M14.5 9v6M18 7v10M20.5 12H20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />,
};

export type IconName = keyof typeof paths;

export function Icon({ name, size = 20, ...rest }: { name: IconName | string; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...rest}>
      {paths[name] ?? null}
    </svg>
  );
}

export const iconNames = Object.keys(paths);
