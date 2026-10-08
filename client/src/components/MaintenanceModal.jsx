import { useEffect, useState } from 'react';
import { Wrench, Clock, RefreshCw, ArrowRight } from 'lucide-react';

export default function MaintenanceModal({ maintenance, onRefresh, isAdmin }) {
  const [checking, setChecking] = useState(false);
  const [countdown, setCountdown] = useState('');

  const startTime = maintenance?.maintenanceStart || 'Scheduled';
  const endTime = maintenance?.maintenanceEnd || 'Ongoing';
  const message = maintenance?.maintenanceMessage ||
    'Cadence is currently undergoing scheduled platform upgrades and database optimizations to bring you an even faster typing experience.';

  // Live countdown calculation if endTime contains a valid date/time
  useEffect(() => {
    if (!maintenance?.maintenanceEnd) {
      setCountdown('');
      return;
    }

    const calculateRemaining = () => {
      const target = new Date(maintenance.maintenanceEnd).getTime();
      if (isNaN(target)) {
        setCountdown('');
        return;
      }
      const now = Date.now();
      const diff = target - now;

      if (diff <= 0) {
        setCountdown('Wrapping up final checks...');
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      const parts = [];
      if (hours > 0) parts.push(`${hours}h`);
      parts.push(`${minutes}m`);
      parts.push(`${seconds}s`);
      setCountdown(parts.join(' '));
    };

    calculateRemaining();
    const interval = setInterval(calculateRemaining, 1000);
    return () => clearInterval(interval);
  }, [maintenance?.maintenanceEnd]);

  const handleCheck = async () => {
    setChecking(true);
    try {
      await onRefresh?.();
    } finally {
      setTimeout(() => setChecking(false), 600);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="maintenance-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem',
        backgroundColor: 'rgba(9, 10, 15, 0.88)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        overflowY: 'auto'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '520px',
          background: 'linear-gradient(145deg, rgba(28, 31, 46, 0.95), rgba(18, 20, 30, 0.98))',
          borderRadius: '24px',
          border: '1px solid rgba(245, 158, 11, 0.25)',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 40px -10px rgba(245, 158, 11, 0.15)',
          padding: '2rem 1.75rem',
          textAlign: 'center',
          color: '#ffffff',
          position: 'relative',
          animation: 'fadeIn 0.3s ease-out'
        }}
      >
        {/* Glow halo */}
        <div
          style={{
            position: 'absolute',
            top: '-60px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '180px',
            height: '180px',
            background: 'radial-gradient(circle, rgba(245, 158, 11, 0.25) 0%, rgba(245, 158, 11, 0) 70%)',
            pointerEvents: 'none',
            zIndex: 0
          }}
        />

        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Badge */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.35rem 0.85rem',
              borderRadius: '999px',
              backgroundColor: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              color: '#fbbf24',
              fontSize: '0.75rem',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              marginBottom: '1.25rem'
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#fbbf24',
                boxShadow: '0 0 10px #fbbf24',
                display: 'inline-block'
              }}
            />
            Maintenance Mode Active
          </div>

          {/* Icon */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '4.5rem',
              height: '4.5rem',
              borderRadius: '20px',
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(217, 119, 6, 0.08))',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              color: '#fbbf24',
              margin: '0 auto 1.25rem'
            }}
          >
            <Wrench size="2.25rem" />
          </div>

          {/* Title */}
          <h2
            id="maintenance-title"
            style={{
              fontSize: '1.65rem',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              margin: '0 0 0.6rem',
              color: '#ffffff'
            }}
          >
            Under Scheduled Maintenance
          </h2>

          {/* Description */}
          <p
            style={{
              fontSize: '0.92rem',
              lineHeight: 1.55,
              color: 'rgba(255, 255, 255, 0.72)',
              margin: '0 0 1.5rem',
              maxWidth: '440px',
              marginLeft: 'auto',
              marginRight: 'auto'
            }}
          >
            {message}
          </p>

          {/* Time Window Display Box */}
          <div
            style={{
              background: 'rgba(15, 17, 26, 0.75)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '16px',
              padding: '1.1rem 1rem',
              marginBottom: '1.5rem',
              textAlign: 'left'
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                fontSize: '0.78rem',
                fontWeight: 600,
                color: 'rgba(255, 255, 255, 0.55)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: '0.75rem'
              }}
            >
              <Clock size="1rem" style={{ color: '#fbbf24' }} />
              <span>Scheduled Maintenance Window</span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto 1fr',
                gap: '0.75rem',
                alignItems: 'center'
              }}
            >
              <div
                style={{
                  padding: '0.65rem 0.75rem',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.06)'
                }}
              >
                <div style={{ fontSize: '0.72rem', color: 'rgba(255, 255, 255, 0.45)', marginBottom: '0.15rem' }}>FROM</div>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#f3f4f6', wordBreak: 'break-word' }}>
                  {startTime}
                </div>
              </div>

              <div style={{ color: 'rgba(255, 255, 255, 0.3)', fontSize: '1.1rem' }}>
                <ArrowRight size="1.2rem" />
              </div>

              <div
                style={{
                  padding: '0.65rem 0.75rem',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.06)'
                }}
              >
                <div style={{ fontSize: '0.72rem', color: 'rgba(255, 255, 255, 0.45)', marginBottom: '0.15rem' }}>TO</div>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#fbbf24', wordBreak: 'break-word' }}>
                  {endTime}
                </div>
              </div>
            </div>

            {countdown && (
              <div
                style={{
                  marginTop: '0.85rem',
                  paddingTop: '0.65rem',
                  borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '0.8rem'
                }}
              >
                <span style={{ color: 'rgba(255, 255, 255, 0.5)' }}>Estimated Remaining:</span>
                <span style={{ fontWeight: 700, color: '#38bdf8', fontFamily: 'monospace', letterSpacing: '0.04em' }}>
                  {countdown}
                </span>
              </div>
            )}
          </div>

          {/* Action Button: Check Status */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <button
              type="button"
              onClick={handleCheck}
              disabled={checking}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                borderRadius: '12px',
                border: 'none',
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '0.92rem',
                cursor: checking ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                boxShadow: '0 4px 14px rgba(245, 158, 11, 0.35)',
                transition: 'all 0.15s ease',
                opacity: checking ? 0.75 : 1
              }}
            >
              <RefreshCw size="1rem" className={checking ? 'spin' : ''} />
              {checking ? 'Checking Status...' : 'Check Status / Refresh'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
