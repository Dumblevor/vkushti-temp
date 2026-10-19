import type { ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

const make = (paths: ReactNode, filled = false) =>
  function Icon({ size = 24, ...rest }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={filled ? 'currentColor' : 'none'}
        stroke={filled ? 'none' : 'currentColor'}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...rest}
      >
        {paths}
      </svg>
    );
  };

export const IconX = make(<path d="M18 6 6 18M6 6l12 12" />);
export const IconHeart = make(
  <path d="M12 21s-7.5-4.6-9.6-9.3C.9 8.3 3 4.5 6.7 4.5c2.1 0 3.6 1.1 5.3 3 1.7-1.9 3.2-3 5.3-3 3.7 0 5.8 3.8 4.3 7.2C19.5 16.4 12 21 12 21Z" />,
  true,
);
export const IconBolt = make(<path d="M13.5 2 4 13.5h7L10 22l9.5-11.5h-7L13.5 2Z" />, true);
export const IconCompass = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
  </>,
);
export const IconChat = make(<path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.4L3 21l2.1-5.6A8.4 8.4 0 1 1 21 11.5Z" />);
export const IconUser = make(
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1.5-4 4.4-6 8-6s6.5 2 8 6" />
  </>,
);
export const IconSliders = make(<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4" />);
export const IconBack = make(<path d="m15 18-6-6 6-6" />);
export const IconMore = make(
  <>
    <circle cx="5" cy="12" r="1.2" />
    <circle cx="12" cy="12" r="1.2" />
    <circle cx="19" cy="12" r="1.2" />
  </>,
);
export const IconSend = make(<path d="M4 12 20 4l-6 16-3-7-7-1Z" />);
export const IconCalendar = make(
  <>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </>,
);
export const IconPin = make(
  <>
    <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </>,
);
export const IconClock = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>,
);
export const IconCheck = make(<path d="m5 12.5 4.5 4.5L19 7.5" />);
export const IconShield = make(<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.3 7.5 9.5 4.3-1.2 7.5-4.9 7.5-9.5V6L12 3Z" />);
export const IconGlobe = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3Z" />
  </>,
);
export const IconPlus = make(<path d="M12 5v14M5 12h14" />);
export const IconDownload = make(<path d="M12 4v11m0 0 4.5-4.5M12 15l-4.5-4.5M4.5 19.5h15" />);
export const IconFlag = make(<path d="M5 21V4m0 0h11l-1.5 4L16 12H5" />);
export const IconVerified = make(
  <path d="M12 2.5 14.6 4.4l3.2-.1 1 3 2.6 1.9-1 3 1 3-2.6 1.9-1 3-3.2-.1L12 21.5l-2.6-1.9-3.2.1-1-3L2.6 14.8l1-3-1-3 2.6-1.9 1-3 3.2.1L12 2.5Zm-1.2 13.3 5.4-5.6-1.3-1.3-4.1 4.3-2-2-1.3 1.3 3.3 3.3Z" />,
  true,
);
