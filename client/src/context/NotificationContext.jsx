import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from './AuthContext.jsx';

const NotificationCtx = createContext(null);

const EMPTY_DATA = {
  inbox: [],
  announcements: [],
  notifications: [],
  unreadCount: 0,
  totalCount: 0
};

const getNotifKey = (userId) => userId ? `cadence_notifications_${userId}` : null;
const getDismissedKey = (userId) => userId ? `cadence_dismissed_notifs_${userId}` : null;

export function NotificationProvider({ children }) {
  const auth = useAuth();
  const userId = auth?.user?.id || auth?.user?._id || null;
  const prevUserIdRef = useRef(userId);

  const [data, setData] = useState(() => {
    // Purge legacy un-isolated storage
    try {
      localStorage.removeItem('cadence_notifications_v1');
      localStorage.removeItem('cadence_dismissed_notifs_v1');
    } catch {}

    if (!userId) {
      return EMPTY_DATA;
    }
    const key = getNotifKey(userId);
    try {
      const saved = localStorage.getItem(key);
      if (saved) return JSON.parse(saved);
    } catch {}
    return EMPTY_DATA;
  });

  // Watch auth changes (login, logout, account switch)
  useEffect(() => {
    // When logged out, completely wipe in-memory state and clear legacy storage
    if (!userId) {
      setData(EMPTY_DATA);
      try {
        localStorage.removeItem('cadence_notifications_v1');
        localStorage.removeItem('cadence_dismissed_notifs_v1');
      } catch {}
      prevUserIdRef.current = null;
      return;
    }

    const key = getNotifKey(userId);
    let initialUserState = EMPTY_DATA;
    try {
      const saved = localStorage.getItem(key);
      if (saved) initialUserState = JSON.parse(saved);
    } catch {}

    // If switching from another account or guest, load this user's stored messages immediately
    if (prevUserIdRef.current !== userId) {
      setData(initialUserState);
      prevUserIdRef.current = userId;
    }

    // Sync from server for this authenticated user
    let active = true;
    api('/notifications')
      .then(serverData => {
        if (!active || !serverData) return;
        setData(prev => {
          let dismissed = [];
          try {
            const dismissedKey = getDismissedKey(userId);
            if (dismissedKey) {
              dismissed = JSON.parse(localStorage.getItem(dismissedKey) || '[]');
            }
          } catch {}
          const dismissedSet = new Set(dismissed);

          const existingInboxIds = new Set((prev.inbox || []).map(i => i.id));
          const newInboxItems = (serverData.inbox || []).filter(i => !existingInboxIds.has(i.id) && !dismissedSet.has(i.id));
          const mergedInbox = [...(prev.inbox || []), ...newInboxItems];

          const existingAnnIds = new Set((prev.announcements || []).map(a => a.id));
          const newAnnItems = (serverData.announcements || []).filter(a => !existingAnnIds.has(a.id) && !dismissedSet.has(a.id));
          const mergedAnnouncements = [...(prev.announcements || []), ...newAnnItems];

          const existingNotifIds = new Set((prev.notifications || []).map(n => n.id));
          const newNotifItems = (serverData.notifications || []).filter(n => !existingNotifIds.has(n.id) && !dismissedSet.has(n.id));
          const mergedNotifications = [...(prev.notifications || []), ...newNotifItems];

          const unread = mergedNotifications.filter(n => !n.read).length + mergedInbox.filter(i => !i.read).length;

          const nextData = {
            inbox: mergedInbox,
            announcements: mergedAnnouncements,
            notifications: mergedNotifications,
            unreadCount: unread,
            totalCount: Math.max(25, mergedInbox.length + mergedNotifications.length)
          };

          try {
            if (key) localStorage.setItem(key, JSON.stringify(nextData));
          } catch {}

          return nextData;
        });
      })
      .catch(() => {});

    return () => { active = false; };
  }, [userId]);

  const refreshNotifications = useCallback(() => {
    if (!userId) return Promise.resolve();
    const key = getNotifKey(userId);
    return api('/notifications')
      .then(serverData => {
        if (!serverData) return;
        setData(prev => {
          let dismissed = [];
          try {
            const dismissedKey = getDismissedKey(userId);
            if (dismissedKey) {
              dismissed = JSON.parse(localStorage.getItem(dismissedKey) || '[]');
            }
          } catch {}
          const dismissedSet = new Set(dismissed);

          const existingInboxIds = new Set((prev.inbox || []).map(i => i.id));
          const newInboxItems = (serverData.inbox || []).filter(i => !existingInboxIds.has(i.id) && !dismissedSet.has(i.id));
          const mergedInbox = [...(prev.inbox || []), ...newInboxItems];

          const existingAnnIds = new Set((prev.announcements || []).map(a => a.id));
          const newAnnItems = (serverData.announcements || []).filter(a => !existingAnnIds.has(a.id) && !dismissedSet.has(a.id));
          const mergedAnnouncements = [...(prev.announcements || []), ...newAnnItems];

          const existingNotifIds = new Set((prev.notifications || []).map(n => n.id));
          const newNotifItems = (serverData.notifications || []).filter(n => !existingNotifIds.has(n.id) && !dismissedSet.has(n.id));
          const mergedNotifications = [...(prev.notifications || []), ...newNotifItems];

          const unread = mergedNotifications.filter(n => !n.read).length + mergedInbox.filter(i => !i.read).length;

          const nextData = {
            inbox: mergedInbox,
            announcements: mergedAnnouncements,
            notifications: mergedNotifications,
            unreadCount: unread,
            totalCount: Math.max(25, mergedInbox.length + mergedNotifications.length)
          };

          try {
            if (key) localStorage.setItem(key, JSON.stringify(nextData));
          } catch {}

          return nextData;
        });
      })
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    const handleSync = () => {
      refreshNotifications();
    };
    window.addEventListener('cadence:refresh-notifications', handleSync);
    return () => window.removeEventListener('cadence:refresh-notifications', handleSync);
  }, [refreshNotifications]);

  // Persist locally for the authenticated user
  useEffect(() => {
    if (!userId) return;
    try {
      const key = getNotifKey(userId);
      if (key) localStorage.setItem(key, JSON.stringify(data));
    } catch {}
  }, [userId, data]);

  const addNotification = useCallback(({ category = 'Success', title, content = '', type = 'success' }) => {
    if (!userId) return; // Do not persist account notifications if logged out
    const newItem = {
      id: 'notif-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      category,
      title,
      content,
      type,
      time: 'Just now',
      read: false,
      createdAt: new Date().toISOString()
    };
    setData(prev => {
      const nextList = [newItem, ...(prev.notifications || [])].slice(0, 25);
      const unread = nextList.filter(n => !n.read).length + (prev.inbox || []).filter(i => !i.read).length;
      const nextData = {
        ...prev,
        notifications: nextList,
        unreadCount: unread,
        totalCount: Math.max(25, nextList.length)
      };
      try {
        const key = getNotifKey(userId);
        if (key) localStorage.setItem(key, JSON.stringify(nextData));
      } catch {}
      return nextData;
    });
  }, [userId]);

  const markAllAsRead = useCallback(() => {
    setData(prev => {
      const nextData = {
        ...prev,
        notifications: (prev.notifications || []).map(n => ({ ...n, read: true })),
        inbox: (prev.inbox || []).map(i => ({ ...i, read: true })),
        unreadCount: 0
      };
      try {
        const key = getNotifKey(userId);
        if (key) localStorage.setItem(key, JSON.stringify(nextData));
      } catch {}
      return nextData;
    });
  }, [userId]);

  const markAsRead = useCallback((id) => {
    setData(prev => {
      const nextList = (prev.notifications || []).map(n => n.id === id ? { ...n, read: true } : n);
      const nextInbox = (prev.inbox || []).map(i => i.id === id ? { ...i, read: true } : i);
      const unread = nextList.filter(n => !n.read).length + nextInbox.filter(i => !i.read).length;
      const nextData = {
        ...prev,
        notifications: nextList,
        inbox: nextInbox,
        unreadCount: unread
      };
      try {
        const key = getNotifKey(userId);
        if (key) localStorage.setItem(key, JSON.stringify(nextData));
      } catch {}
      return nextData;
    });
  }, [userId]);

  const clearNotification = useCallback((id) => {
    if (userId) {
      try {
        const dismissedKey = getDismissedKey(userId);
        const dismissed = JSON.parse(localStorage.getItem(dismissedKey) || '[]');
        if (!dismissed.includes(id)) {
          dismissed.push(id);
          localStorage.setItem(dismissedKey, JSON.stringify(dismissed));
        }
      } catch {}
    }
    setData(prev => {
      const nextList = (prev.notifications || []).filter(n => n.id !== id);
      const nextInbox = (prev.inbox || []).filter(i => i.id !== id);
      const nextAnn = (prev.announcements || []).filter(a => a.id !== id);
      const unread = nextList.filter(n => !n.read).length + nextInbox.filter(i => !i.read).length;
      const nextData = {
        ...prev,
        notifications: nextList,
        inbox: nextInbox,
        announcements: nextAnn,
        unreadCount: unread
      };
      try {
        const key = getNotifKey(userId);
        if (key) localStorage.setItem(key, JSON.stringify(nextData));
      } catch {}
      return nextData;
    });
  }, [userId]);

  const clearInbox = useCallback(() => {
    setData(prev => {
      if (userId) {
        try {
          const inboxIds = (prev.inbox || []).map(i => i.id);
          const dismissedKey = getDismissedKey(userId);
          const dismissed = JSON.parse(localStorage.getItem(dismissedKey) || '[]');
          const updated = Array.from(new Set([...dismissed, ...inboxIds]));
          localStorage.setItem(dismissedKey, JSON.stringify(updated));
        } catch {}
      }
      const unread = (prev.notifications || []).filter(n => !n.read).length;
      const nextData = {
        ...prev,
        inbox: [],
        unreadCount: unread
      };
      try {
        const key = getNotifKey(userId);
        if (key) localStorage.setItem(key, JSON.stringify(nextData));
      } catch {}
      return nextData;
    });
  }, [userId]);

  const clearAnnouncements = useCallback(() => {
    setData(prev => {
      if (userId) {
        try {
          const annIds = (prev.announcements || []).map(a => a.id);
          const dismissedKey = getDismissedKey(userId);
          const dismissed = JSON.parse(localStorage.getItem(dismissedKey) || '[]');
          const updated = Array.from(new Set([...dismissed, ...annIds]));
          localStorage.setItem(dismissedKey, JSON.stringify(updated));
        } catch {}
      }
      const nextData = {
        ...prev,
        announcements: []
      };
      try {
        const key = getNotifKey(userId);
        if (key) localStorage.setItem(key, JSON.stringify(nextData));
      } catch {}
      return nextData;
    });
  }, [userId]);

  const clearNotifications = useCallback(() => {
    setData(prev => {
      if (userId) {
        try {
          const notifIds = (prev.notifications || []).map(n => n.id);
          const dismissedKey = getDismissedKey(userId);
          const dismissed = JSON.parse(localStorage.getItem(dismissedKey) || '[]');
          const updated = Array.from(new Set([...dismissed, ...notifIds]));
          localStorage.setItem(dismissedKey, JSON.stringify(updated));
        } catch {}
      }
      const unread = (prev.inbox || []).filter(i => !i.read).length;
      const nextData = {
        ...prev,
        notifications: [],
        unreadCount: unread
      };
      try {
        const key = getNotifKey(userId);
        if (key) localStorage.setItem(key, JSON.stringify(nextData));
      } catch {}
      return nextData;
    });
  }, [userId]);

  const clearAll = useCallback(() => {
    setData(prev => {
      if (userId) {
        try {
          const allIds = [
            ...(prev.notifications || []).map(n => n.id),
            ...(prev.inbox || []).map(i => i.id),
            ...(prev.announcements || []).map(a => a.id)
          ];
          const dismissedKey = getDismissedKey(userId);
          const dismissed = JSON.parse(localStorage.getItem(dismissedKey) || '[]');
          const updated = Array.from(new Set([...dismissed, ...allIds]));
          localStorage.setItem(dismissedKey, JSON.stringify(updated));
        } catch {}
      }
      const nextData = {
        ...prev,
        notifications: [],
        inbox: [],
        announcements: [],
        unreadCount: 0
      };
      try {
        const key = getNotifKey(userId);
        if (key) localStorage.setItem(key, JSON.stringify(nextData));
      } catch {}
      return nextData;
    });
  }, [userId]);

  return (
    <NotificationCtx.Provider
      value={{
        ...data,
        addNotification,
        markAsRead,
        markAllAsRead,
        clearNotification,
        clearInbox,
        clearAnnouncements,
        clearNotifications,
        clearAll,
        refreshNotifications
      }}
    >
      {children}
    </NotificationCtx.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationCtx);
  if (!ctx) {
    return {
      inbox: [],
      announcements: [],
      notifications: [],
      unreadCount: 0,
      totalCount: 0,
      addNotification: () => {},
      markAsRead: () => {},
      markAllAsRead: () => {},
      clearNotification: () => {},
      clearInbox: () => {},
      clearAnnouncements: () => {},
      clearNotifications: () => {},
      clearAll: () => {},
      refreshNotifications: () => Promise.resolve()
    };
  }
  return ctx;
}
