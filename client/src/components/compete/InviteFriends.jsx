import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus, Check } from 'lucide-react';
import Avatar from '../Avatar.jsx';
import { api } from '../../lib/api.js';
import { useCompete } from '../../context/CompeteContext.jsx';

/** Friends who aren't in the room yet, with an invite button each. */
export default function InviteFriends({ room }) {
  const compete = useCompete();
  const [friends, setFriends] = useState(null);
  const [sent, setSent] = useState(() => new Set());

  useEffect(() => {
    const ctrl = new AbortController();
    api('/friends', { signal: ctrl.signal }).then(d => setFriends(d.friends)).catch(err => { if (err.name !== 'AbortError') setFriends([]); });
    return () => ctrl.abort();
  }, [compete.friendsVersion]);

  const inRoom = new Set(room.players.map(p => p.id));
  const list = (friends || []).filter(f => !inRoom.has(f.id));
  const invite = f => { compete.invite(f.id); setSent(s => new Set(s).add(f.id)); };

  return (
    <div className="panel glass cp-invite">
      <h2><UserPlus size="1em" />Invite friends</h2>
      {friends === null ? <div className="spinner" role="status" aria-label="Loading friends" />
        : !friends.length ? (
          <div className="empty"><p>You don't have any friends yet.</p><Link className="btn outline sm" to="/friends">Add friends</Link></div>
        ) : !list.length ? <p className="muted">All your friends are already here.</p> : (
          <ul className="cp-invite-list">
            {list.map(f => (
              <li key={f.id}>
                <span className="cp-av-wrap"><Avatar name={f.username} url={f.avatar} size="sm" /><span className={`cp-presence${f.online ? ' on' : ''}`} aria-hidden="true" /></span>
                <span className="cp-invite-name">{f.username}<small>{f.online ? 'Online' : 'Offline'}</small></span>
                <button type="button" className="btn outline sm" disabled={sent.has(f.id)} onClick={() => invite(f)}>
                  {sent.has(f.id) ? <><Check size="1em" />Invited</> : 'Invite'}
                </button>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
