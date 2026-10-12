import { useEffect } from 'react';

/** Transient notification. Controlled by props; `onDismiss` is called after `duration` ms. */
export default function Toast({ message, variant = 'success', onDismiss, duration = 3000 }) {
  useEffect(() => {
    if (!message || !onDismiss) return undefined;
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [message, onDismiss, duration]);

  if (!message) return null;
  return (
    <div className={`toast toast-${variant}`} role="status">
      {message}
    </div>
  );
}
