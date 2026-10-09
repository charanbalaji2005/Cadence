import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Inbox, Megaphone, MessageSquare, ChevronUp, ChevronDown, X, ArrowLeft, Trash2, Maximize2 } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext.jsx';

export default function NotificationCenter({ isOpen, onClose }) {
  const panelRef = useRef(null);
  const [activeModalItem, setActiveModalItem] = useState(null);
  const {
    inbox = [],
    announcements = [],
    notifications = [],
    unreadCount = 0,
    totalCount = 25,
    markAsRead,
    clearNotification,
    clearInbox,
    clearAnnouncements,
    clearNotifications,
    clearAll
  } = useNotifications();

  useEffect(() => {
    if (!isOpen) {
      setActiveModalItem(null);
      return undefined;
    }

    const onMouseDown = e => {
      // If modal is open, don't close drawer when clicking modal
      if (e.target.closest('.notif-popup-backdrop') || e.target.closest('.notif-popup-modal')) {
        return;
      }
      if (panelRef.current && !panelRef.current.contains(e.target) && !e.target.closest('.notif-toggle-btn')) {
        onClose();
      }
    };

    const onKeyDown = e => {
      if (e.key === 'Escape') {
        if (activeModalItem) {
          setActiveModalItem(null);
          e.stopPropagation();
        } else {
          onClose();
        }
      }
    };

    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose, activeModalItem]);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop dimming the rest of the screen */}
          <motion.div
            key="notif-backdrop"
            className="notif-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Right-side Docked Drawer */}
          <motion.div
            key="notif-panel"
            ref={panelRef}
            className="notif-center-panel"
            role="region"
            aria-label="Notification Center"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 280 }}
          >
            {/* Top Bar with Mobile Back Button */}
            <div className="notif-top-bar">
              <button
                type="button"
                className="notif-back-btn"
                onClick={onClose}
                aria-label="Back"
                title="Back to test"
              >
                <ArrowLeft size={16} />
                <span>Back</span>
              </button>
              <span className="notif-top-title">Cadence Mail</span>
              <button
                type="button"
                className="notif-close-icon-btn"
                onClick={onClose}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            {/* 1. Inbox Section */}
            <div className="notif-section">
              <div className="notif-header">
                <div className="notif-header-title">
                  <Inbox size={18} className="notif-icon" />
                  <span className="notif-label">Inbox</span>
                </div>
                <div className="notif-header-right">
                  {inbox && inbox.length > 0 && (
                    <button
                      type="button"
                      className="notif-clear-all-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        clearInbox();
                      }}
                      aria-label="Clear all inbox messages"
                      title="Clear all inbox messages"
                    >
                      Clear all
                    </button>
                  )}
                  <span className={`notif-counter${unreadCount > 0 ? ' has-unread' : ''}`}>
                    {unreadCount}/{totalCount}
                  </span>
                  <button
                    type="button"
                    className="notif-caret-btn"
                    onClick={onClose}
                    aria-label="Collapse Inbox"
                    title="Close"
                  >
                    <ChevronUp size={16} />
                  </button>
                </div>
              </div>
              <div className="notif-content">
                {inbox && inbox.length > 0 ? (
                  <ul className="notif-list">
                    <AnimatePresence initial={false}>
                      {inbox.map(item => (
                        <motion.li
                          key={item.id}
                          layout
                          initial={{ opacity: 0, height: 0, y: -4 }}
                          animate={{ opacity: 1, height: 'auto', y: 0 }}
                          exit={{ opacity: 0, height: 0, scale: 0.95 }}
                          transition={{ duration: 0.16 }}
                          className={`notif-item${item.read ? ' is-read' : ''}`}
                          onClick={() => {
                            markAsRead(item.id);
                            setActiveModalItem({ ...item, itemSection: 'inbox' });
                          }}
                          title="Click to read full message"
                        >
                          <div className="notif-item-body">
                            <span className="notif-status-tag">{item.category || 'Direct'}</span>
                            <div className="notif-item-title">{item.title}</div>
                            {item.content && <div className="notif-item-desc">{item.content}</div>}
                            {item.content && item.content.length > 45 && (
                              <span className="notif-read-more-hint">
                                <span>Read full message</span>
                                <Maximize2 size={10} />
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            className="notif-item-clear-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              clearNotification(item.id);
                            }}
                            aria-label={`Dismiss message: ${item.title}`}
                            title="Clear message"
                          >
                            <X size={13} strokeWidth={2.4} />
                          </button>
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                ) : (
                  <p className="notif-empty">Nothing to show</p>
                )}
              </div>
            </div>

            <div className="notif-divider" />

            {/* 2. Announcements Section */}
            <div className="notif-section">
              <div className="notif-header">
                <div className="notif-header-title">
                  <Megaphone size={18} className="notif-icon" />
                  <span className="notif-label">Announcements</span>
                </div>
                {announcements && announcements.length > 0 && (
                  <button
                    type="button"
                    className="notif-clear-all-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearAnnouncements();
                    }}
                    aria-label="Clear all announcements"
                    title="Clear all announcements"
                  >
                    Clear all
                  </button>
                )}
              </div>
              <div className="notif-content">
                {announcements && announcements.length > 0 ? (
                  <ul className="notif-list">
                    <AnimatePresence initial={false}>
                      {announcements.map(item => (
                        <motion.li
                          key={item.id}
                          layout
                          initial={{ opacity: 0, height: 0, y: -4 }}
                          animate={{ opacity: 1, height: 'auto', y: 0 }}
                          exit={{ opacity: 0, height: 0, scale: 0.95 }}
                          transition={{ duration: 0.16 }}
                          className="notif-item"
                          onClick={() => {
                            setActiveModalItem({ ...item, itemSection: 'announcement' });
                          }}
                          title="Click to read announcement"
                        >
                          <div className="notif-item-body">
                            <span className="notif-status-tag">{item.category || 'Cadence'}</span>
                            <div className="notif-item-title">{item.title}</div>
                            {item.content && <div className="notif-item-desc">{item.content}</div>}
                            {item.content && item.content.length > 45 && (
                              <span className="notif-read-more-hint">
                                <span>Read full announcement</span>
                                <Maximize2 size={10} />
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            className="notif-item-clear-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              clearNotification(item.id);
                            }}
                            aria-label={`Dismiss announcement: ${item.title}`}
                            title="Clear message"
                          >
                            <X size={13} strokeWidth={2.4} />
                          </button>
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                ) : (
                  <p className="notif-empty">Nothing to show</p>
                )}
              </div>
            </div>

            <div className="notif-divider" />

            {/* 3. Notifications Section */}
            <div className="notif-section">
              <div className="notif-header">
                <div className="notif-header-title">
                  <MessageSquare size={18} className="notif-icon" />
                  <span className="notif-label">Notifications</span>
                </div>
                {notifications && notifications.length > 0 && (
                  <button
                    type="button"
                    className="notif-clear-all-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearNotifications();
                    }}
                    aria-label="Clear all notifications"
                    title="Clear all notifications"
                  >
                    Clear all
                  </button>
                )}
              </div>
              <div className="notif-content">
                {notifications && notifications.length > 0 ? (
                  <ul className="notif-list">
                    <AnimatePresence initial={false}>
                      {notifications.map(item => (
                        <motion.li
                          key={item.id}
                          layout
                          initial={{ opacity: 0, height: 0, y: -4 }}
                          animate={{ opacity: 1, height: 'auto', y: 0 }}
                          exit={{ opacity: 0, height: 0, scale: 0.95 }}
                          transition={{ duration: 0.16 }}
                          className={`notif-item${item.read ? ' is-read' : ''}`}
                          onClick={() => {
                            markAsRead(item.id);
                            setActiveModalItem({ ...item, itemSection: 'notification' });
                          }}
                          title="Click to read notification"
                        >
                          <div className="notif-item-body">
                            <span className="notif-status-tag">{item.category || 'Success'}</span>
                            <div className="notif-item-title">{item.title}</div>
                            {item.content && <div className="notif-item-desc">{item.content}</div>}
                            {item.content && item.content.length > 45 && (
                              <span className="notif-read-more-hint">
                                <span>Read full notification</span>
                                <Maximize2 size={10} />
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            className="notif-item-clear-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              clearNotification(item.id);
                            }}
                            aria-label={`Dismiss notification: ${item.title}`}
                            title="Clear message"
                          >
                            <X size={13} strokeWidth={2.4} />
                          </button>
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                ) : (
                  <p className="notif-empty">Nothing to show</p>
                )}
              </div>
            </div>

            {/* Bottom Caret matching Image 2 */}
            <div className="notif-bottom-caret">
              <ChevronDown size={14} />
            </div>
          </motion.div>

          {/* Big Popup Modal for Reading Full Message Details */}
          <AnimatePresence>
            {activeModalItem && (
              <div
                className="notif-popup-backdrop"
                onClick={() => setActiveModalItem(null)}
                role="presentation"
              >
                <motion.div
                  className="notif-popup-modal"
                  initial={{ opacity: 0, scale: 0.92, y: 16 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.94, y: 12 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 320 }}
                  onClick={e => e.stopPropagation()}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="notif-modal-title"
                >
                  {/* Modal Header */}
                  <div className="notif-popup-header">
                    <div className="notif-popup-badges">
                      <span className={`notif-popup-tag notif-popup-tag-${activeModalItem.itemSection || activeModalItem.type || 'inbox'}`}>
                        {activeModalItem.itemSection === 'announcement' || activeModalItem.type === 'announcement' ? 'Announcement' : activeModalItem.itemSection === 'notification' || activeModalItem.type === 'notification' ? 'Notification' : 'Inbox Mail'}
                      </span>
                      <span className="notif-popup-category">
                        {activeModalItem.category || 'Cadence Team'}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="notif-popup-close-btn"
                      onClick={() => setActiveModalItem(null)}
                      aria-label="Close message"
                      title="Close"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  {/* Modal Body */}
                  <div className="notif-popup-body-wrap">
                    <h2 id="notif-modal-title" className="notif-popup-title">
                      {activeModalItem.title}
                    </h2>

                    <div className="notif-popup-meta">
                      <span className="notif-popup-author">
                        From {activeModalItem.author || 'Cadence Admin'}
                      </span>
                      <span className="notif-popup-dot">•</span>
                      <span className="notif-popup-time">
                        {activeModalItem.time || 'Recently'}
                      </span>
                    </div>

                    <div className="notif-popup-text">
                      {activeModalItem.content || 'No content provided.'}
                    </div>
                  </div>

                  {/* Modal Footer */}
                  <div className="notif-popup-footer">
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => {
                        clearNotification(activeModalItem.id);
                        setActiveModalItem(null);
                      }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: 'var(--sub)' }}
                    >
                      <Trash2 size={14} />
                      <span>Dismiss message</span>
                    </button>
                    <button
                      type="button"
                      className="btn primary sm"
                      onClick={() => setActiveModalItem(null)}
                      style={{ minWidth: '90px', justifyContent: 'center' }}
                    >
                      Done
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

