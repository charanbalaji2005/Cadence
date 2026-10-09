import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  Copy, Check, Share2, Award, Zap, Target, Clock, 
  ExternalLink, ArrowLeft, Swords, UserPlus,
  BadgeCheck, User as UserIcon, Mail, Hash, BookOpen, Layers
} from 'lucide-react';
import Avatar from '../components/Avatar.jsx';
import { api } from '../lib/api.js';
import { fmtDate, fmtTime } from '../lib/format.js';
import { batchLabel, SRMAP_LOGO_LG, cleanSrmPhoto, getDefaultSrmAvatar } from '../lib/srmap.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useUI } from '../context/UIContext.jsx';

export default function ProfilePage() {
  const { username } = useParams();
  const auth = useAuth();
  const ui = useUI();
  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const publicUrl = `https://cadence-wj7c.onrender.com/profile/${username || ''}`;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    api(`/users/${encodeURIComponent(username)}`)
      .then(res => {
        if (!active) return;
        setProfileData(res);
        setLoading(false);
      })
      .catch(err => {
        if (!active) return;
        setError(err.message || 'Could not load player profile.');
        setLoading(false);
      });

    return () => { active = false; };
  }, [username]);

  const handleCopyLink = () => {
    try {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(publicUrl);
      } else {
        const input = document.createElement('input');
        input.value = publicUrl;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      setCopied(true);
      ui.toast('Public profile link copied! 📋');
      setTimeout(() => setCopied(false), 2200);
    } catch {
      ui.toast('Could not copy link to clipboard.');
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${profileData?.user?.username}'s Cadence Profile`,
          text: `Check out ${profileData?.user?.username}'s typing stats on Cadence!`,
          url: publicUrl
        });
      } catch {
        handleCopyLink();
      }
    } else {
      handleCopyLink();
    }
  };

  if (loading) {
    return (
      <div className="page profile-page">
        <div className="spinner" role="status" aria-label="Loading profile" />
      </div>
    );
  }

  if (error || !profileData?.user) {
    return (
      <div className="page profile-page">
        <div className="panel glass empty" style={{ margin: '2rem 0' }}>
          <h2>Player Not Found</h2>
          <p>{error || `No user found with username "${username}".`}</p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '1rem' }}>
            <Link to="/leaderboard" className="btn outline">
              <ArrowLeft size="1em" /> View Leaderboard
            </Link>
            <Link to="/" className="btn primary">
              Take a Typing Test
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { user, stats = {}, recentResults = [] } = profileData;
  const srm = user.connections?.srm_ap;
  const isMe = auth.user && auth.user.username.toLowerCase() === user.username.toLowerCase();

  const isSrmConnected = srm?.verified === true;
  const srmPhoto = isSrmConnected
    ? cleanSrmPhoto(srm.profilePhoto || user.avatar, srm.gender)
    : null;
  const avatarUrl = srmPhoto || user.avatar;
  const defaultFallback = isSrmConnected ? getDefaultSrmAvatar(srm.gender) : null;
  const studentName = srm?.name || srm?.displayName;

  return (
    <div className="page profile-page">
      {/* Back Link */}
      <div style={{ marginBottom: '1rem' }}>
        <Link to="/leaderboard" className="btn ghost sm" style={{ paddingLeft: 0 }}>
          <ArrowLeft size="1em" /> Back to Leaderboard
        </Link>
      </div>

      {/* Main Profile Banner Card */}
      <div className="panel glass profile-banner-card">
        <div className="profile-banner-left">
          <Avatar name={user.username} url={avatarUrl} size="lg" />
          <div className="profile-meta">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0 }}>{user.username}</h1>
              {srm?.verified && (
                <span className="srm-badge" style={{ margin: 0 }} title="Verified with Connect SRM AP">
                  <BadgeCheck size="1em" aria-hidden="true" />
                  SRM AP Connected {srm.batchYear ? `· ${batchLabel(srm.batchYear)}` : ''}
                </span>
              )}
            </div>
            {studentName && (
              <p style={{ margin: '0.2rem 0 0', fontSize: '1rem', fontWeight: 600, color: 'var(--sub)' }}>
                {studentName}
              </p>
            )}
            <div className="profile-tags">
              {user.role && user.role !== 'USER' && (
                <span className="profile-role-badge">{user.role.replace('_', ' ')}</span>
              )}
              {user.provider && user.provider !== 'email' && (
                <span className="profile-joined-text">via {user.provider === 'srm_ap' ? 'Connect SRM AP' : user.provider}</span>
              )}
              {user.createdAt && (
                <span className="profile-joined-text">• Joined {fmtDate(user.createdAt)}</span>
              )}
            </div>
          </div>
        </div>

        <div className="profile-banner-actions">
          {isMe ? (
            <>
              <Link to="/account" className="btn primary">
                Account Settings
              </Link>
              <Link to="/stats" className="btn outline">
                My Full Stats
              </Link>
            </>
          ) : (
            <>
              <Link to="/compete" className="btn primary">
                <Swords size="1em" /> Race in Compete
              </Link>
              <Link to="/friends" className="btn outline">
                <UserPlus size="1em" /> Add Friend
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Connect SRM AP Verified Student Card */}
      {srm?.verified && (
        <div className="panel glass srm-public-card">
          <div className="srm-public-header">
            <div className="srm-public-brand">
              <img src="/connect-srmap.png" onError={e => { e.currentTarget.src = SRMAP_LOGO_LG; }} alt="Connect SRM AP" />
              <div>
                <h3>Connect SRM AP Verified Student</h3>
                <p>Identity verified by SRM University AP{srm.batchYear ? ` · ${batchLabel(srm.batchYear)}` : ''}</p>
              </div>
            </div>
            <span className="srm-badge" title="Verified with SRM AP">
              <BadgeCheck size="1em" aria-hidden="true" />
              Verified Student {srm.batchYear ? `· ${batchLabel(srm.batchYear)}` : ''}
            </span>
          </div>

          <div className="srm-public-body">
            <div className="srm-photo-wrap">
              <img
                src={avatarUrl || defaultFallback}
                alt={studentName || user.username}
                referrerPolicy="no-referrer"
                onError={e => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = defaultFallback;
                }}
              />
            </div>

            <div className="srm-details-grid">
              {studentName && (
                <div className="srm-detail-item">
                  <span className="srm-detail-label">
                    <UserIcon size="0.95em" aria-hidden="true" /> Verified Name
                  </span>
                  <span className="srm-detail-value">{studentName}</span>
                </div>
              )}

              {srm.registerNumberMasked && (
                <div className="srm-detail-item">
                  <span className="srm-detail-label">
                    <Hash size="0.95em" aria-hidden="true" /> Registration No.
                  </span>
                  <span className="srm-detail-value mono">{srm.registerNumberMasked}</span>
                </div>
              )}

              {srm.gender && (
                <div className="srm-detail-item">
                  <span className="srm-detail-label">
                    Gender
                  </span>
                  <span className="srm-detail-value">{srm.gender}</span>
                </div>
              )}

              {(srm.email || srm.verifiedEmail) && (
                <div className="srm-detail-item">
                  <span className="srm-detail-label">
                    <Mail size="0.95em" aria-hidden="true" /> Institutional Email
                  </span>
                  <a
                    href={`mailto:${srm.email || srm.verifiedEmail}`}
                    className="srm-detail-value mono email-link"
                  >
                    {srm.email || srm.verifiedEmail}
                  </a>
                </div>
              )}

              {(srm.className || srm.section) && (
                <div className="srm-detail-item">
                  <span className="srm-detail-label">
                    <BookOpen size="0.95em" aria-hidden="true" /> Class & Section
                  </span>
                  <span className="srm-detail-value">
                    {[srm.className, srm.section ? `Sec ${srm.section}` : null].filter(Boolean).join(' · ')}
                  </span>
                </div>
              )}

              {srm.batchYear && (
                <div className="srm-detail-item">
                  <span className="srm-detail-label">
                    <Layers size="0.95em" aria-hidden="true" /> Batch
                  </span>
                  <span className="srm-detail-value">{batchLabel(srm.batchYear)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Public Share Box */}
      <div className="panel glass profile-share-box">
        <div className="profile-share-left">
          <Share2 size={20} className="profile-share-icon" />
          <div>
            <span className="profile-share-label">Public Profile Link</span>
            <span className="profile-share-url">{publicUrl}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            type="button"
            className="btn primary sm"
            onClick={handleCopyLink}
            aria-label="Copy public link"
          >
            {copied ? <Check size="1em" /> : <Copy size="1em" />}
            <span>{copied ? 'Copied' : 'Copy link'}</span>
          </button>
          <button
            type="button"
            className="btn outline sm"
            onClick={handleShare}
            aria-label="Share public link"
            title="Share link"
          >
            <ExternalLink size="1em" /> Share
          </button>
        </div>
      </div>

      {/* Stats Summary Grid */}
      <div className="profile-stats-grid">
        <div className="panel glass profile-stat-box">
          <span className="profile-stat-label">Tests</span>
          <div className="profile-stat-val">{stats.resultsCount || recentResults.length || 0}</div>
        </div>
        <div className="panel glass profile-stat-box">
          <span className="profile-stat-label">Best Speed</span>
          <div className="profile-stat-val">
            {stats.bestWpm || 0}
            <span className="profile-stat-unit">wpm</span>
          </div>
        </div>
        <div className="panel glass profile-stat-box">
          <span className="profile-stat-label">Average Speed</span>
          <div className="profile-stat-val">
            {stats.avgWpm || 0}
            <span className="profile-stat-unit">wpm</span>
          </div>
        </div>
        <div className="panel glass profile-stat-box">
          <span className="profile-stat-label">Avg Accuracy</span>
          <div className="profile-stat-val">
            {stats.avgAcc || 0}
            <span className="profile-stat-unit">%</span>
          </div>
        </div>
        <div className="panel glass profile-stat-box">
          <span className="profile-stat-label">Typing Time</span>
          <div className="profile-stat-val" style={{ fontSize: '1.35rem' }}>
            {fmtTime(stats.totalTime || 0)}
          </div>
        </div>
      </div>

      {/* Recent Test History */}
      <div className="panel glass">
        <h2>Recent Public Tests</h2>
        {recentResults && recentResults.length > 0 ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Mode</th>
                  <th>wpm</th>
                  <th>accuracy</th>
                  <th>raw</th>
                  <th>consistency</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {recentResults.map((r, i) => (
                  <tr key={r._id || i}>
                    <td>
                      <span style={{ textTransform: 'capitalize' }}>
                        {r.mode} {r.modeValue || ''}
                      </span>
                    </td>
                    <td className="hl">{Math.round(r.wpm)}</td>
                    <td className="n">{Number(r.acc).toFixed(1)}%</td>
                    <td className="n">{Math.round(r.raw || r.wpm)}</td>
                    <td className="n">{Math.round(r.consistency || 0)}%</td>
                    <td>{fmtDate(r.date || r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="notif-empty" style={{ margin: '2rem 0' }}>
            No recent test results published yet.
          </p>
        )}
      </div>
    </div>
  );
}
