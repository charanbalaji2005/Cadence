import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell, Mail, Megaphone, Plus, Trash2, Send, CheckCircle2,
  AlertTriangle, Info, Clock, Sparkles, X, Eye, Filter
} from 'lucide-react';
import { aget, apost, adelete } from './lib.js';
import { useUI } from '../context/UIContext.jsx';
import { useNotifications } from '../context/NotificationContext.jsx';

const PRESET_CATEGORIES = [
  'Cadence Team',
  'Platform Update',
  'System Notice',
  'Pro Tips',
  'Championship',
  'Maintenance'
];

export default function BroadcastPage() {
  const ui = useUI();
  const notif = useNotifications();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ items: [], counts: { total: 0, inbox: 0, announcements: 0, notifications: 0 } });
  const [filterType, setFilterType] = useState('all');
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previewModal, setPreviewModal] = useState(null);

  // Form state
  const [form, setForm] = useState({
    type: 'inbox',
    category: 'Cadence Team',
    title: '',
    content: '',
    severity: 'info'
  });

  const loadBroadcasts = useCallback(async () => {
    try {
      const res = await aget('/broadcasts');
      if (res) setData(res);
    } catch (err) {
      ui.toast('Failed to load broadcasts: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [ui]);

  useEffect(() => {
    loadBroadcasts();
  }, [loadBroadcasts]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.content.trim()) {
      ui.toast('Please enter both title and message content.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apost('/broadcasts', form);
      if (res?.ok) {
        ui.toast('Broadcast dispatched to all users successfully! 🚀');
        setIsComposeOpen(false);
        setForm({
          type: 'inbox',
          category: 'Cadence Team',
          title: '',
          content: '',
          severity: 'info'
        });
        await loadBroadcasts();
        // Refresh local user notifications drawer immediately
        window.dispatchEvent(new CustomEvent('cadence:refresh-notifications'));
        if (notif.refreshNotifications) notif.refreshNotifications();
      }
    } catch (err) {
      ui.toast('Error sending broadcast: ' + (err.message || 'Server error'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id, title) => {
    if (!window.confirm(`Delete broadcast "${title}"? It will no longer appear for users.`)) return;
    try {
      await adelete(`/broadcasts/${id}`);
      ui.toast('Broadcast removed.');
      await loadBroadcasts();
      window.dispatchEvent(new CustomEvent('cadence:refresh-notifications'));
      if (notif.refreshNotifications) notif.refreshNotifications();
    } catch (err) {
      ui.toast('Failed to delete: ' + (err.message || 'Error'));
    }
  };

  const filteredItems = (data.items || []).filter(item => {
    if (filterType === 'all') return true;
    return item.type === filterType;
  });

  return (
    <div className="adm-page adm-broadcasts-page">
      {/* Header */}
      <div className="adm-page-header">
        <div>
          <h1 className="adm-page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Bell className="text-accent" size={26} />
            <span>Cadence Mail & Broadcasts</span>
          </h1>
          <p className="adm-page-desc">
            Send platform-wide messages, announcements, and alerts received by all users in their Cadence Mail drawer.
          </p>
        </div>
        <button
          type="button"
          className="btn primary"
          onClick={() => setIsComposeOpen(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
        >
          <Plus size={16} />
          <span>Compose Broadcast</span>
        </button>
      </div>

      {/* KPI Stats */}
      <div className="adm-stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: '1.5rem' }}>
        <div className="adm-stat-card">
          <div className="adm-stat-icon" style={{ background: 'rgba(99, 102, 241, 0.12)', color: '#6366f1' }}>
            <Send size={20} />
          </div>
          <div>
            <div className="adm-stat-num">{data.counts.total}</div>
            <div className="adm-stat-label">Total Broadcasts</div>
          </div>
        </div>

        <div className="adm-stat-card">
          <div className="adm-stat-icon" style={{ background: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6' }}>
            <Mail size={20} />
          </div>
          <div>
            <div className="adm-stat-num">{data.counts.inbox}</div>
            <div className="adm-stat-label">Inbox Mails</div>
          </div>
        </div>

        <div className="adm-stat-card">
          <div className="adm-stat-icon" style={{ background: 'rgba(234, 88, 12, 0.12)', color: '#ea580c' }}>
            <Megaphone size={20} />
          </div>
          <div>
            <div className="adm-stat-num">{data.counts.announcements}</div>
            <div className="adm-stat-label">Announcements</div>
          </div>
        </div>

        <div className="adm-stat-card">
          <div className="adm-stat-icon" style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#10b981' }}>
            <Bell size={20} />
          </div>
          <div>
            <div className="adm-stat-num">{data.counts.notifications}</div>
            <div className="adm-stat-label">System Alerts</div>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="adm-table-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div className="adm-tabs" style={{ display: 'flex', gap: '0.4rem' }}>
          {[
            { id: 'all', label: 'All Messages', count: data.counts.total },
            { id: 'inbox', label: 'Inbox', count: data.counts.inbox },
            { id: 'announcement', label: 'Announcements', count: data.counts.announcements },
            { id: 'notification', label: 'Notifications', count: data.counts.notifications }
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              className={`adm-tab-btn ${filterType === tab.id ? 'active' : ''}`}
              onClick={() => setFilterType(tab.id)}
              style={{
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                border: 'none',
                background: filterType === tab.id ? 'var(--field-strong, rgba(255,255,255,0.08))' : 'transparent',
                color: filterType === tab.id ? 'var(--text)' : 'var(--sub)',
                fontWeight: filterType === tab.id ? 600 : 400,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                fontSize: '0.84rem'
              }}
            >
              <span>{tab.label}</span>
              <span style={{
                fontSize: '0.72rem',
                opacity: 0.75,
                background: 'rgba(0,0,0,0.2)',
                padding: '0.1rem 0.4rem',
                borderRadius: '99px'
              }}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Broadcasts List */}
      <div className="adm-card" style={{ padding: '0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--sub)' }}>
            <div className="spinner" style={{ margin: '0 auto 1rem' }} />
            <span>Loading broadcast history...</span>
          </div>
        ) : filteredItems.length === 0 ? (
          <div style={{ padding: '3.5rem 2rem', textAlign: 'center', color: 'var(--sub)' }}>
            <Bell size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.35 }} />
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text)', margin: '0 0 0.35rem' }}>No broadcasts found</h3>
            <p style={{ fontSize: '0.84rem', margin: 0 }}>Compose a new message to broadcast to all Cadence users.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="adm-table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--hairline)' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Type</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Category</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Title & Content</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Author</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Date</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map(item => (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--hairline)' }}>
                    <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}>
                      <span className={`adm-badge adm-badge-${item.type === 'inbox' ? 'blue' : item.type === 'announcement' ? 'orange' : 'green'}`} style={{ textTransform: 'capitalize' }}>
                        {item.type}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.84rem' }}>{item.category}</span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', maxWidth: '380px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: '0.2rem' }}>{item.title}</div>
                      <div style={{
                        fontSize: '0.8rem',
                        color: 'var(--sub)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        lineHeight: 1.35
                      }}>
                        {item.content}
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap', fontSize: '0.82rem', color: 'var(--sub)' }}>
                      {item.author}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap', fontSize: '0.82rem', color: 'var(--sub)' }}>
                      {new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={() => setPreviewModal(item)}
                        title="View Full Popup Preview"
                        style={{ marginRight: '0.4rem' }}
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={() => handleDelete(item.id, item.title)}
                        title="Delete Broadcast"
                        style={{ color: 'var(--error, #f43f5e)' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Compose Broadcast Modal */}
      <AnimatePresence>
        {isComposeOpen && (
          <div className="adm-modal-backdrop" onClick={() => !submitting && setIsComposeOpen(false)}>
            <motion.div
              className="adm-modal"
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: '620px', width: '100%', padding: '1.75rem' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Sparkles size={20} className="text-accent" />
                  <span>Compose Broadcast</span>
                </h2>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setIsComposeOpen(false)}
                  disabled={submitting}
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSend} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Type Selection */}
                <div>
                  <label className="adm-form-label" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                    Destination Section
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                    {[
                      { id: 'inbox', label: 'Inbox Mail', icon: Mail, desc: 'Appears in Mail Inbox' },
                      { id: 'announcement', label: 'Announcement', icon: Megaphone, desc: 'Major platform updates' },
                      { id: 'notification', label: 'Notification', icon: Bell, desc: 'Status notices & alerts' }
                    ].map(t => {
                      const Icon = t.icon;
                      const selected = form.type === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setForm(f => ({ ...f, type: t.id }))}
                          style={{
                            padding: '0.75rem',
                            borderRadius: '10px',
                            border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--hairline)'}`,
                            background: selected ? 'rgba(16, 185, 129, 0.08)' : 'var(--field)',
                            color: selected ? 'var(--text)' : 'var(--sub)',
                            textAlign: 'left',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.25rem'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, fontSize: '0.86rem' }}>
                            <Icon size={16} />
                            <span>{t.label}</span>
                          </div>
                          <small style={{ fontSize: '0.72rem', opacity: 0.8 }}>{t.desc}</small>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Category Preset & Custom */}
                <div>
                  <label className="adm-form-label" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                    Category Badge
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.5rem' }}>
                    {PRESET_CATEGORIES.map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, category: cat }))}
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.2rem 0.55rem',
                          borderRadius: '6px',
                          border: '1px solid var(--hairline)',
                          background: form.category === cat ? 'var(--accent)' : 'var(--field)',
                          color: form.category === cat ? 'var(--accent-ink)' : 'var(--sub)',
                          fontWeight: form.category === cat ? 700 : 500,
                          cursor: 'pointer'
                        }}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    className="adm-input"
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    placeholder="Category name (e.g. Cadence Team, Release 2.0)"
                    required
                  />
                </div>

                {/* Title */}
                <div>
                  <label className="adm-form-label" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                    Title / Subject
                  </label>
                  <input
                    type="text"
                    className="adm-input"
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. Tournament starts this weekend!"
                    maxLength={200}
                    required
                  />
                </div>

                {/* Content */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                    <label className="adm-form-label" style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                      Message Content (Big popup preview supported)
                    </label>
                    <small style={{ color: 'var(--sub)', fontSize: '0.75rem' }}>{form.content.length}/5000</small>
                  </div>
                  <textarea
                    className="adm-input"
                    rows={5}
                    value={form.content}
                    onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                    placeholder="Type the full message here. When typists click this card, it will open up in a big popup so they can read every detail..."
                    maxLength={5000}
                    required
                    style={{ resize: 'vertical', lineHeight: 1.5, fontFamily: 'inherit' }}
                  />
                </div>

                {/* Severity */}
                <div>
                  <label className="adm-form-label" style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                    Tone / Severity
                  </label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {[
                      { id: 'info', label: 'Standard / Info' },
                      { id: 'success', label: 'Success / Achievement' },
                      { id: 'warning', label: 'Important / Warning' },
                      { id: 'urgent', label: 'Urgent / Critical' }
                    ].map(s => (
                      <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="severity"
                          value={s.id}
                          checked={form.severity === s.id}
                          onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}
                        />
                        <span>{s.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '0.75rem' }}>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => setIsComposeOpen(false)}
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn primary"
                    disabled={submitting || !form.title.trim() || !form.content.trim()}
                    style={{ minWidth: '150px', justifyContent: 'center' }}
                  >
                    {submitting ? 'Dispatching...' : 'Send to All Users'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Big Popup Preview Modal */}
      <AnimatePresence>
        {previewModal && (
          <div className="notif-popup-overlay" onClick={() => setPreviewModal(null)}>
            <motion.div
              className="notif-popup-card"
              initial={{ opacity: 0, scale: 0.92, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 8 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="notif-popup-header">
                <div className="notif-popup-tags">
                  <span className={`notif-popup-type-tag ${previewModal.type}`}>
                    {previewModal.type === 'announcement' ? 'Announcement' : previewModal.type === 'notification' ? 'Notification' : 'Inbox Mail'}
                  </span>
                  <span className="notif-popup-category-tag">{previewModal.category || 'Cadence Team'}</span>
                </div>
                <button
                  type="button"
                  className="notif-popup-close-btn"
                  onClick={() => setPreviewModal(null)}
                  title="Close preview"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="notif-popup-content-wrap">
                <h2 className="notif-popup-title">{previewModal.title}</h2>
                <div className="notif-popup-meta">
                  <span className="notif-popup-author">{previewModal.author || 'Cadence Admin'}</span>
                  <span className="notif-popup-dot">•</span>
                  <span className="notif-popup-time">
                    {new Date(previewModal.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="notif-popup-body">
                  {previewModal.content}
                </div>
              </div>

              <div className="notif-popup-footer">
                <button
                  type="button"
                  className="btn primary sm"
                  onClick={() => setPreviewModal(null)}
                >
                  Close Preview
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
