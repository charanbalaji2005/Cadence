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

  // Sync initial notifications from server only if user has not stored local state
  useEffect(() => {
    let active = true;
    const saved = localStorage.getItem('cadence_notifications_v1');
    if (saved) return;

    api('/notifications')
      .then(serverData => {
        if (!active || !serverData) return;
        setData(prev => ({
          ...prev,
          ...serverData
        }));
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
      const nextList = prev.notifications.map(n => n.id === id ? { ...n, read: true } : n);
      const unread = nextList.filter(n => !n.read).length;
      return {
        ...prev,
        notifications: nextList,
        unreadCount: unread
      };
    });
  }, []);

  const clearNotification = useCallback((id) => {
    setData(prev => {
      const nextList = (prev.notifications || []).filter(n => n.id !== id);
      const nextInbox = (prev.inbox || []).filter(i => i.id !== id);
      const unread = nextList.filter(n => !n.read).length + nextInbox.filter(i => !i.read).length;
      return {
        ...prev,
        notifications: nextList,
        inbox: nextInbox,
        unreadCount: unread
      };
    });
  }, []);

  const clearAll = useCallback(() => {
    setData(prev => ({
      ...prev,
      notifications: [],
      inbox: [],
      unreadCount: 0
    }));
  }, []);

  return (
    <NotificationCtx.Provider
      value={{
        ...data,
        addNotification,
        markAsRead,
        markAllAsRead,
        clearNotification,
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
      clearAll: () => {}
    };
  }
  return ctx;
}
