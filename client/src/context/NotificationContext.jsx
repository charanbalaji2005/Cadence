import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';

const NotificationCtx = createContext(null);

const DEFAULT_NOTIFICATIONS = [
  {
    id: 'default-notif-1',
    category: 'Success',
    title: 'Account created',
    type: 'success',
    read: true,
    createdAt: new Date().toISOString()
  }
];

export function NotificationProvider({ children }) {
  const [data, setData] = useState(() => {
    try {
      const saved = localStorage.getItem('cadence_notifications_v1');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      inbox: [],
      announcements: [],
      notifications: DEFAULT_NOTIFICATIONS,
      unreadCount: 0,
      totalCount: 25
    };
  });

  // Persist locally
  useEffect(() => {
    try {
      localStorage.setItem('cadence_notifications_v1', JSON.stringify(data));
    } catch {}
  }, [data]);

  // Sync initial notifications & mails from server, merging backend mails
  useEffect(() => {
    let active = true;

    api('/notifications')
      .then(serverData => {
        if (!active || !serverData) return;
        setData(prev => {
          let dismissed = [];
          try {
            dismissed = JSON.parse(localStorage.getItem('cadence_dismissed_notifs_v1') || '[]');
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

          return {
            ...prev,
            inbox: mergedInbox,
            announcements: mergedAnnouncements,
            notifications: mergedNotifications,
            unreadCount: unread,
            totalCount: Math.max(25, mergedInbox.length + mergedNotifications.length)
          };
        });
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const addNotification = useCallback(({ category = 'Success', title, content = '', type = 'success' }) => {
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
      const nextList = [newItem, ...prev.notifications].slice(0, 25);
      const unread = nextList.filter(n => !n.read).length;
      return {
        ...prev,
        notifications: nextList,
        unreadCount: unread,
        totalCount: Math.max(25, nextList.length)
      };
    });
  }, []);

  const markAllAsRead = useCallback(() => {
    setData(prev => ({
      ...prev,
      notifications: prev.notifications.map(n => ({ ...n, read: true })),
      inbox: prev.inbox.map(i => ({ ...i, read: true })),
      unreadCount: 0
    }));
  }, []);

  const markAsRead = useCallback((id) => {
    setData(prev => {
      const nextList = (prev.notifications || []).map(n => n.id === id ? { ...n, read: true } : n);
      const nextInbox = (prev.inbox || []).map(i => i.id === id ? { ...i, read: true } : i);
      const unread = nextList.filter(n => !n.read).length + nextInbox.filter(i => !i.read).length;
      return {
        ...prev,
        notifications: nextList,
        inbox: nextInbox,
        unreadCount: unread
      };
    });
  }, []);

  const clearNotification = useCallback((id) => {
    try {
      const dismissed = JSON.parse(localStorage.getItem('cadence_dismissed_notifs_v1') || '[]');
      if (!dismissed.includes(id)) {
        dismissed.push(id);
        localStorage.setItem('cadence_dismissed_notifs_v1', JSON.stringify(dismissed));
      }
    } catch {}
    setData(prev => {
      const nextList = (prev.notifications || []).filter(n => n.id !== id);
      const nextInbox = (prev.inbox || []).filter(i => i.id !== id);
      const nextAnn = (prev.announcements || []).filter(a => a.id !== id);
      const unread = nextList.filter(n => !n.read).length + nextInbox.filter(i => !i.read).length;
      return {
        ...prev,
        notifications: nextList,
        inbox: nextInbox,
        announcements: nextAnn,
        unreadCount: unread
      };
    });
  }, []);

  const clearInbox = useCallback(() => {
    setData(prev => {
      try {
        const inboxIds = (prev.inbox || []).map(i => i.id);
        const dismissed = JSON.parse(localStorage.getItem('cadence_dismissed_notifs_v1') || '[]');
        const updated = Array.from(new Set([...dismissed, ...inboxIds]));
        localStorage.setItem('cadence_dismissed_notifs_v1', JSON.stringify(updated));
      } catch {}
      const unread = (prev.notifications || []).filter(n => !n.read).length;
      return {
        ...prev,
        inbox: [],
        unreadCount: unread
      };
    });
  }, []);

  const clearAnnouncements = useCallback(() => {
    setData(prev => {
      try {
        const annIds = (prev.announcements || []).map(a => a.id);
        const dismissed = JSON.parse(localStorage.getItem('cadence_dismissed_notifs_v1') || '[]');
        const updated = Array.from(new Set([...dismissed, ...annIds]));
        localStorage.setItem('cadence_dismissed_notifs_v1', JSON.stringify(updated));
      } catch {}
      return {
        ...prev,
        announcements: []
      };
    });
  }, []);

  const clearNotifications = useCallback(() => {
    setData(prev => {
      try {
        const notifIds = (prev.notifications || []).map(n => n.id);
        const dismissed = JSON.parse(localStorage.getItem('cadence_dismissed_notifs_v1') || '[]');
        const updated = Array.from(new Set([...dismissed, ...notifIds]));
        localStorage.setItem('cadence_dismissed_notifs_v1', JSON.stringify(updated));
      } catch {}
      const unread = (prev.inbox || []).filter(i => !i.read).length;
      return {
        ...prev,
        notifications: [],
        unreadCount: unread
      };
    });
  }, []);

  const clearAll = useCallback(() => {
    setData(prev => {
      try {
        const allIds = [
          ...(prev.notifications || []).map(n => n.id),
          ...(prev.inbox || []).map(i => i.id),
          ...(prev.announcements || []).map(a => a.id)
        ];
        const dismissed = JSON.parse(localStorage.getItem('cadence_dismissed_notifs_v1') || '[]');
        const updated = Array.from(new Set([...dismissed, ...allIds]));
        localStorage.setItem('cadence_dismissed_notifs_v1', JSON.stringify(updated));
      } catch {}
      return {
        ...prev,
        notifications: [],
        inbox: [],
        announcements: [],
        unreadCount: 0
      };
    });
  }, []);

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
        clearAll
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
      notifications: DEFAULT_NOTIFICATIONS,
      unreadCount: 0,
      totalCount: 25,
      addNotification: () => {},
      markAsRead: () => {},
      markAllAsRead: () => {},
      clearNotification: () => {},
      clearInbox: () => {},
      clearAnnouncements: () => {},
      clearNotifications: () => {},
      clearAll: () => {}
    };
  }
  return ctx;
}
