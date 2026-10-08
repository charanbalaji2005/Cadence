import { useEffect, useState } from 'react';
import { Gauge, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api.js';

export default function WaitingRoomModal({ queueData, onAdmitted }) {
  const [position, setPosition] = useState(queueData?.queuePosition || 3);
  const [waitSec, setWaitSec] = useState(queueData?.estimatedWaitSeconds || 5);
  const [admitted, setAdmitted] = useState(false);
  const [progress, setProgress] = useState(15);

  useEffect(() => {
    // Progress bar animation
    const progressInterval = setInterval(() => {
      setProgress(p => {
        if (p >= 95) return 95;
        return p + Math.floor(Math.random() * 8) + 4;
      });
    }, 400);

    // Countdown timer
    const countInterval = setInterval(() => {
      setWaitSec(s => Math.max(1, s - 1));
      setPosition(pos => Math.max(1, pos - 1));
    }, 1000);

    // Auto-poll traffic status to admit user
    const pollInterval = setInterval(async () => {
      try {
        const res = await api('/traffic/status');
        if (res && res.status === 'NORMAL') {
          // Traffic returned to normal, admit user immediately!
          setAdmitted(true);
          setProgress(100);
          setTimeout(() => {
            onAdmitted?.();
          }, 700);
        }
      } catch {
        // Fallback admittance after wait timer expires
      }
    }, 2000);

    // Fallback admittance after waitSec
    const fallbackTimer = setTimeout(() => {
      setAdmitted(true);
      setProgress(100);
      setTimeout(() => {
        onAdmitted?.();
      }, 700);
    }, (queueData?.estimatedWaitSeconds || 6) * 1000);

    return () => {
      clearInterval(progressInterval);
      clearInterval(countInterval);
      clearInterval(pollInterval);
      clearTimeout(fallbackTimer);
    };
  }, [queueData, onAdmitted]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="traffic-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99998,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem',
        backgroundColor: 'rgba(7, 9, 15, 0.9)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        overflowY: 'auto'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '490px',
          background: 'linear-gradient(145deg, rgba(22, 27, 46, 0.96), rgba(15, 18, 30, 0.98))',
          borderRadius: '24px',
          border: '1px solid rgba(56, 189, 248, 0.28)',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.75), 0 0 45px -10px rgba(56, 189, 248, 0.18)',
          padding: '2rem 1.75rem',
          textAlign: 'center',
          color: '#ffffff',
          position: 'relative'
        }}
      >
        {/* Glow backdrop */}
        <div
          style={{
            position: 'absolute',
            top: '-50px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '160px',
            height: '160px',
            background: 'radial-gradient(circle, rgba(56, 189, 248, 0.22) 0%, rgba(56, 189, 248, 0) 70%)',
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
              gap: '0.45rem',
              padding: '0.35rem 0.85rem',
              borderRadius: '999px',
              backgroundColor: admitted ? 'rgba(34, 197, 94, 0.15)' : 'rgba(56, 189, 248, 0.12)',
              border: `1px solid ${admitted ? 'rgba(34, 197, 94, 0.35)' : 'rgba(56, 189, 248, 0.3)'}`,
              color: admitted ? '#4ade80' : '#38bdf8',
              fontSize: '0.74rem',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              marginBottom: '1.25rem'
            }}
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: admitted ? '#4ade80' : '#38bdf8',
                boxShadow: `0 0 10px ${admitted ? '#4ade80' : '#38bdf8'}`,
                display: 'inline-block'
              }}
            />
            {admitted ? 'Admitted • Welcome' : 'Auto Traffic Governor Active'}
          </div>

          {/* Icon */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '4.25rem',
              height: '4.25rem',
              borderRadius: '20px',
              background: admitted
                ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(16, 185, 129, 0.08))'
                : 'linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(14, 165, 233, 0.08))',
              border: `1px solid ${admitted ? 'rgba(34, 197, 94, 0.35)' : 'rgba(56, 189, 248, 0.35)'}`,
              color: admitted ? '#4ade80' : '#38bdf8',
              margin: '0 auto 1.25rem',
              transition: 'all 0.3s ease'
            }}
          >
            {admitted ? <CheckCircle2 size="2.2rem" /> : <Gauge size="2.2rem" />}
          </div>

          {/* Title */}
          <h2
            id="traffic-title"
            style={{
              fontSize: '1.55rem',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              margin: '0 0 0.5rem',
              color: '#ffffff'
            }}
          >
            {admitted ? 'Capacity Available!' : 'High Traffic Volume Detected'}
          </h2>

          {/* Description */}
          <p
            style={{
              fontSize: '0.9rem',
              lineHeight: 1.5,
              color: 'rgba(255, 255, 255, 0.7)',
              margin: '0 0 1.5rem',
              maxWidth: '420px',
              marginLeft: 'auto',
              marginRight: 'auto'
            }}
          >
            {admitted
              ? 'Server capacity has freed up. Admitting your connection to Cadence now...'
              : 'Cadence is experiencing a sudden surge of typists! You are in our automated queue and will be admitted in a moment.'}
          </p>

          {/* Live Queue Box */}
          <div
            style={{
              background: 'rgba(13, 16, 26, 0.75)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '16px',
              padding: '1.25rem',
              marginBottom: '1.25rem',
              textAlign: 'left'
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.75rem',
                fontSize: '0.82rem'
              }}
            >
              <span style={{ color: 'rgba(255, 255, 255, 0.55)', fontWeight: 600 }}>Queue Status:</span>
              <span style={{ color: admitted ? '#4ade80' : '#38bdf8', fontWeight: 700, fontFamily: 'monospace' }}>
                {admitted ? 'ADMITTED' : `Position #${position} in line`}
              </span>
            </div>

            {/* Progress Track */}
            <div
              style={{
                width: '100%',
                height: '8px',
                borderRadius: '999px',
                background: 'rgba(255, 255, 255, 0.08)',
                overflow: 'hidden',
                position: 'relative',
                marginBottom: '0.75rem'
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${progress}%`,
                  borderRadius: '999px',
                  background: admitted
                    ? 'linear-gradient(90deg, #22c55e, #4ade80)'
                    : 'linear-gradient(90deg, #0284c7, #38bdf8)',
                  boxShadow: `0 0 10px ${admitted ? '#22c55e' : '#38bdf8'}`,
                  transition: 'width 0.3s ease'
                }}
              />
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.78rem',
                color: 'rgba(255, 255, 255, 0.45)'
              }}
            >
              <span>Auto-admitting in:</span>
              <span style={{ fontWeight: 600, color: '#f3f4f6' }}>
                {admitted ? '0s' : `~${waitSec} seconds`}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
