/**
 * The icon set.
 *
 * 24×24, stroke-width 2 (2.4 for the check), round caps, no fill, coloured with
 * `currentColor` so each one inherits whatever it sits in. The path data is the
 * design's own, not an approximation: these are drawn to match Lucide, so that
 * is what to adopt if the set ever needs to grow.
 *
 * Arrows are deliberately absent — those are the typographic characters
 * → ← ↑ ↓, which need no markup and inherit the font.
 *
 * Every icon is `aria-hidden`: each one sits inside a control that carries its
 * own accessible name, and announcing the icon as well would say it twice.
 */

interface IconProps {
  readonly size?: number
  readonly className?: string
}

function Icon({
  size = 15,
  className,
  strokeWidth = 2,
  join = false,
  children,
}: IconProps & { strokeWidth?: number; join?: boolean; children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      {...(join ? { strokeLinejoin: 'round' as const } : {})}
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  )
}

export function CopyIcon(props: IconProps) {
  return (
    <Icon {...props} join>
      <rect x="9" y="9" width="11" height="11" rx="2.5" />
      <path d="M5 15V5.5A2.5 2.5 0 0 1 7.5 3H17" />
    </Icon>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props} strokeWidth={2.4} join>
      <path d="M20 6 9 17l-5-5" />
    </Icon>
  )
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Icon>
  )
}

export function MenuIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Icon>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  )
}

export function SunIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
    </Icon>
  )
}

export function MoonIcon(props: IconProps) {
  return (
    <Icon {...props} join>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5Z" />
    </Icon>
  )
}

export function PencilIcon(props: IconProps) {
  return (
    <Icon {...props} join>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </Icon>
  )
}
