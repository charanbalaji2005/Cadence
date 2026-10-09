import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Inbox, Megaphone, MessageSquare, ChevronUp, ChevronDown, X, ArrowLeft } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext.jsx';

export default function NotificationCenter({ isOpen, onClose }) {
  const panelRef = useRef(null);
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
    if (!isOpen) return undefined;

    const onMouseDown = e => {
      if (panelRef.current && !panelRef.current.contains(e.target) && !e.target.closest('.notif-toggle-btn')) {
        onClose();
      }
    };
    const onKeyDown = e => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

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
                          onClick={() => markAsRead(item.id)}
                        >
                          <div className="notif-item-body">
                            <span className="notif-status-tag">{item.category || 'Direct'}</span>
                            <div className="notif-item-title">{item.title}</div>
                            {item.content && <div className="notif-item-desc">{item.content}</div>}
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
                        >
                          <div className="notif-item-body">
                            <span className="notif-status-tag">{item.category || 'Cadence'}</span>
                            <div className="notif-item-title">{item.title}</div>
                            {item.content && <div className="notif-item-desc">{item.content}</div>}
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
                          onClick={() => markAsRead(item.id)}
                        >
                          <div className="notif-item-body">
                            <span className="notif-status-tag">{item.category || 'Success'}</span>
                            <div className="notif-item-title">{item.title}</div>
                            {item.content && <div className="notif-item-desc">{item.content}</div>}
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
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
