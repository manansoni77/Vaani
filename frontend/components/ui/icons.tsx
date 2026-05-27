/**
 * Shared SVG icon components.
 *
 * Every icon accepts an optional `className` prop so callers control size,
 * colour, and any extra utilities (e.g. animate-spin, shrink-0).
 * Sensible defaults are provided so most usages need no prop at all.
 */

export function PhoneIcon({ className = "w-9 h-9 fill-current" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" />
    </svg>
  );
}

export function EndCallIcon({ className = "w-9 h-9 fill-current" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <path d="M6 6h12v12H6z" />
    </svg>
  );
}

export function SpinnerIcon({
  className = "w-9 h-9 animate-spin",
}: {
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <circle cx={12} cy={12} r={10} strokeOpacity={0.25} />
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );
}

export function MicIcon({ className = "w-6 h-6 fill-current" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm-1.5 17.93A8.001 8.001 0 0 1 4 11H2a10 10 0 0 0 9 9.95V23h2v-2.05A10 10 0 0 0 22 11h-2a8 8 0 0 1-6.5 7.93V19h-3v-0.07z" />
    </svg>
  );
}

export function MutedIcon({ className = "w-6 h-6 fill-current" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <path d="M3.71 2.29a1 1 0 0 0-1.42 1.42l18 18a1 1 0 0 0 1.42-1.42l-18-18zM12 1a4 4 0 0 1 4 4v.18l-8 8V5a4 4 0 0 1 4-4zm4 12.46A4 4 0 0 1 8 11V9.46l8 8zM4 11H2a10 10 0 0 0 9 9.95V23h2v-2.05A10 10 0 0 0 22 11h-2a8 8 0 0 1-14.27 3.7L4 11z" />
    </svg>
  );
}

export function CopyIcon({ className = "w-3.5 h-3.5 fill-current" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className}>
      <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z" />
      <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z" />
    </svg>
  );
}

export function CheckIcon({ className = "w-3.5 h-3.5 fill-green-500" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className}>
      <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z" />
    </svg>
  );
}

export function CloseIcon({ className = "w-4 h-4 fill-current" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className}>
      <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z" />
    </svg>
  );
}

export function ChevronDownIcon({
  className = "w-3.5 h-3.5 fill-current",
}: {
  className?: string;
}) {
  return (
    <svg viewBox="0 0 16 16" className={className}>
      <path d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06z" />
    </svg>
  );
}

export function UserIcon({ className = "w-3.5 h-3.5 fill-current shrink-0" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className}>
      <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12.735 14c.618 0 1.093-.561.872-1.139a6.002 6.002 0 0 0-11.215 0c-.22.578.254 1.139.872 1.139h9.47Z" />
    </svg>
  );
}

export function DatabaseIcon({ className = "w-10 h-10 opacity-30" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5zm0 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2z" />
    </svg>
  );
}

export function DownloadIcon({ className = "w-3.5 h-3.5 fill-current" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className}>
      <path d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14Z" />
      <path d="M7.25 7.689V2a.75.75 0 0 1 1.5 0v5.689l1.97-1.97a.749.749 0 1 1 1.06 1.06l-3.25 3.25a.749.749 0 0 1-1.06 0L4.22 6.779a.749.749 0 1 1 1.06-1.06l1.97 1.97Z" />
    </svg>
  );
}
