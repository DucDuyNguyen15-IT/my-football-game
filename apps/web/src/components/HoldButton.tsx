import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

export interface HoldButtonProps {
  onHold: () => void;
  /** Thời gian phải giữ (ms). */
  duration?: number;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Nút xác nhận thao tác khó hoàn tác (DESIGN.md §6.4): giữ chuột/ngón tay hoặc Space/Enter trong
 * `duration` ms mới chạy `onHold`; thả sớm thì huỷ. Thanh nền chạy để báo tiến độ.
 */
export function HoldButton({
  onHold,
  duration = 1000,
  disabled,
  className = 'btn btn--danger',
  children,
}: HoldButtonProps) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const cancel = () => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    setHolding(false);
  };
  const start = () => {
    if (disabled || timer.current !== undefined) return;
    setHolding(true);
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      setHolding(false);
      onHold();
    }, duration);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const isKey = (key: string) => key === ' ' || key === 'Enter';
  return (
    <button
      type="button"
      className={`${className} hold${holding ? ' is-holding' : ''}`}
      style={{ '--hold-ms': `${duration}ms` } as CSSProperties}
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onKeyDown={(e) => {
        if (!isKey(e.key)) return;
        e.preventDefault();
        if (!e.repeat) start();
      }}
      onKeyUp={(e) => {
        if (isKey(e.key)) cancel();
      }}
      onBlur={cancel}
    >
      <span className="hold__fill" aria-hidden="true" />
      <span className="hold__label">{children}</span>
      <span className="sr-only"> (bấm giữ {duration / 1000} giây)</span>
    </button>
  );
}
