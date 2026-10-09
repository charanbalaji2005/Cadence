import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  Copy, Check, Share2, Award, Zap, Target, Clock, 
  ExternalLink, ArrowLeft, Swords, ShieldCheck, UserPlus
} from 'lucide-react';
import Avatar from '../components/Avatar.jsx';
import { api } from '../lib/api.js';
import { fmtDate, fmtTime } from '../lib/format.js';
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
  const isMe = auth.user && auth.user.username.toLowerCase() === user.username.toLowerCase();

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
          <Avatar name={user.username} url={user.avatar} size="lg" />
          <div className="profile-meta">
            <h1>{user.username}</h1>
            <div className="profile-tags">
              {user.role && user.role !== 'USER' && (
                <span className="profile-role-badge">{user.role.replace('_', ' ')}</span>
              )}
              {user.provider && user.provider !== 'email' && (
                <span className="profile-joined-text">via {user.provider}</span>
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
                    <td>{fmtDate(r.date)}</td>
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
