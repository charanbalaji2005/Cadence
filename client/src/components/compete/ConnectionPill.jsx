import { useCompete } from '../../context/CompeteContext.jsx';

const LABEL = { connected: 'Connected', connecting: 'Connecting', reconnecting: 'Reconnecting', disconnected: 'Disconnected', idle: 'Offline' };

/** Connection state in words and a dot, so it never relies on color alone. */
export default function ConnectionPill() {
  const { status, reconnect } = useCompete();
  const label = LABEL[status] || status;
  if (status === 'disconnected') {
    return <button type="button" className="cp-conn is-disconnected" onClick={reconnect} title="Try to reconnect"><span className="dot" aria-hidden="true" />Disconnected, retry</button>;
  }
  return <span className={`cp-conn is-${status}`} role="status"><span className="dot" aria-hidden="true" />{label}{status === 'reconnecting' ? '...' : ''}</span>;
}
