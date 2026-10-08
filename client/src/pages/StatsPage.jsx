import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Keyboard,
  Download,
  Calendar,
  Layers,
  Sparkles,
  BarChart3,
  Clock,
  Flame,
  Trophy,
  History as HistoryIcon
} from 'lucide-react';

import ActivitySummary from '../components/activity/ActivitySummary.jsx';
import ActivityHeatmap from '../components/activity/ActivityHeatmap.jsx';
import PerformanceTrend from '../components/activity/PerformanceTrend.jsx';
import TypingStreak from '../components/activity/TypingStreak.jsx';
import HowYouType from '../components/activity/HowYouType.jsx';
import LanguageActivity from '../components/activity/LanguageActivity.jsx';
import AchievementActivity from '../components/activity/AchievementActivity.jsx';
import TestHistoryList from '../components/activity/TestHistoryList.jsx';
import TestHistoryTimeline from '../components/activity/TestHistoryTimeline.jsx';

import { useData } from '../lib/store.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useUI } from '../context/UIContext.jsx';
import { api } from '../lib/api.js';
import { practiceText } from '../lib/words.js';
import { dayKey, fmtDate, testTypeParts } from '../lib/format.js';
import { streaks, aggregate } from '../lib/achievements.js';
import { fadeIn } from '../animations/variants.js';

function download(name, data, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function StatsPage() {
  const data = useData();
  const auth = useAuth();
  const ui = useUI();
  const nav = useNavigate();
  const { setCfg } = useSettings();

  const all = data.results || [];
  const currentYear = new Date().getFullYear();

  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'history'
  const [historyView, setHistoryView] = useState('table'); // 'table' | 'timeline'
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [backendDays, setBackendDays] = useState(null);
  const [filterDate, setFilterDate] = useState(null);

  // Fetch server-aggregated DailyActivity for authenticated users
  useEffect(() => {
    if (!auth.user) {
      setBackendDays(null);
      return;
    }

    let active = true;
    api(`/activity/year/${selectedYear}`)
      .then(res => {
        if (active && res?.days) {
          setBackendDays(res.days);
        }
      })
      .catch(() => {
        if (active) setBackendDays(null);
      });

    return () => { active = false; };
  }, [auth.user, selectedYear]);

  // Build dailyMap: use backend aggregated days if available, otherwise aggregate locally from results
  const dailyMap = useMemo(() => {
    const map = {};

    if (backendDays && backendDays.length > 0) {
      for (const d of backendDays) {
        map[d.date] = d;
      }
      return map;
    }

    // Client-side fallback aggregation (works for guests, offline, or instant local reactivity)
    for (const r of all) {
      const dKey = dayKey(r.date);
      const charsCount = r.chars
        ? (r.chars.correct || 0) + (r.chars.incorrect || 0) + (r.chars.extra || 0)
        : Math.round((r.wpm * 5 * r.elapsed) / 60);

      if (!map[dKey]) {
        map[dKey] = {
          date: dKey,
          tests: 1,
          characters: charsCount,
          typingTime: Math.round(r.elapsed),
          bestWpm: r.wpm,
          averageWpm: r.wpm,
          averageAccuracy: r.acc,
          achievements: []
        };
      } else {
        const item = map[dKey];
        const prevTests = item.tests;
        const nextTests = prevTests + 1;
        item.averageWpm = (item.averageWpm * prevTests + r.wpm) / nextTests;
        item.averageAccuracy = (item.averageAccuracy * prevTests + r.acc) / nextTests;
        item.bestWpm = Math.max(item.bestWpm, r.wpm);
        item.characters += charsCount;
        item.typingTime += Math.round(r.elapsed);
        item.tests = nextTests;
      }
    }

    return map;
  }, [backendDays, all]);

  // Overall summary statistics
  const summaryStats = useMemo(() => {
    let totalTests = all.length;
    let totalTypingTime = 0;
    let totalCharacters = 0;
    let bestWpm = 0;
    let wpmSum = 0;

    for (const r of all) {
      totalTypingTime += r.elapsed || 0;
      totalCharacters += r.chars
        ? (r.chars.correct || 0) + (r.chars.incorrect || 0) + (r.chars.extra || 0)
        : Math.round((r.wpm * 5 * r.elapsed) / 60);
      if (r.wpm > bestWpm) bestWpm = r.wpm;
      wpmSum += r.wpm;
    }

    const averageWpm = totalTests > 0 ? wpmSum / totalTests : 0;
    const { current, longest } = streaks(all);

    return {
      totalTests,
      totalTypingTime: Math.round(totalTypingTime),
      totalCharacters,
      bestWpm: Math.round(bestWpm),
      averageWpm: Math.round(averageWpm),
      currentStreak: current,
      longestStreak: longest
    };
  }, [all]);

  const handlePracticeKeys = keys => {
    if (!keys || keys.length === 0) return;
    setCfg({
      mode: 'custom',
      customText: practiceText(keys),
      customLabel: `practice: ${keys.join(', ')}`
    });
    nav('/');
  };

  const handleViewDayTests = dateStr => {
    setFilterDate(dateStr);
    setActiveTab('history');
  };

  const exportAs = fmt => {
    if (fmt === 'csv') {
      const lines = [
        'date,wpm,raw,accuracy,consistency,mode,length,punctuation,numbers,seconds',
        ...all.map(h => [
          new Date(h.date).toISOString(),
          h.wpm.toFixed(2),
          h.raw ? h.raw.toFixed(2) : h.wpm.toFixed(2),
          h.acc.toFixed(2),
          (h.consistency || 0).toFixed(1),
          h.mode,
          h.mode2 || '',
          h.punctuation ? 'true' : 'false',
          h.numbers ? 'true' : 'false',
          h.elapsed.toFixed(1)
        ].join(','))
      ];
      download('cadence-typing-history.csv', lines.join('\n'), 'text/csv');
    } else {
      download('cadence-typing-history.json', JSON.stringify(all, null, 2), 'application/json');
    }
  };

  // Loading state
  if (data.loading) {
    return (
      <div className="page wide activity-page">
        <div className="activity-page-head">
          <h1>Typing Activity</h1>
          <p className="lede">Loading your typing journey...</p>
        </div>
        <div className="spinner" role="status" aria-label="Loading" />
      </div>
    );
  }

  // Empty state
  if (!all.length) {
    return (
      <div className="page wide activity-page">
        <div className="activity-page-head">
          <span className="cadence-kicker">cadence performance</span>
          <h1>Typing Activity</h1>
          <p className="lede">
            {auth.user ? `Welcome, ${auth.user.username}.` : 'Your typing journey starts here.'}
          </p>
        </div>
        <div className="panel glass activity-empty-state">
          <div className="empty-content">
            <span className="empty-icon-wrap">
              <Keyboard size={36} />
            </span>
            <h3>Your typing journey starts here.</h3>
            <p>Complete your first typing test to start building your activity history.</p>
            <Link className="btn primary" to="/">
              <Keyboard size={16} />
              <span>Start Typing</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page wide activity-page">
      {/* Top Header & Navigation Tabs */}
      <div className="activity-page-head">
        <div className="activity-page-head-left">
          <span className="cadence-kicker">cadence performance</span>
          <h1>Typing Activity & Dashboard</h1>
          <p className="lede">
            {auth.user
              ? `Every test you've finished as ${auth.user.username}.`
              : <>Your guest activity in this browser. <Link to="/login" style={{ color: 'var(--accent)' }}>Log in</Link> to sync to your account.</>}
          </p>
        </div>

        <div className="activity-page-head-actions">
          <button type="button" className="btn ghost sm" onClick={() => exportAs('csv')}>
            <Download size={14} /> CSV
          </button>
          <button type="button" className="btn ghost sm" onClick={() => exportAs('json')}>
            <Download size={14} /> JSON
          </button>
        </div>
      </div>

      {/* Tabs Switcher: Overview vs Test History */}
      <div className="activity-tabs-bar">
        <div className="activity-tabs-nav" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'overview'}
            className={`activity-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <BarChart3 size={16} />
            <span>Activity & Insights</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'history'}
            className={`activity-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <HistoryIcon size={16} />
            <span>Test History</span>
          </button>
        </div>

        {activeTab === 'history' && (
          <div className="activity-history-toggle">
            <button
              type="button"
              className={`view-toggle-btn ${historyView === 'table' ? 'active' : ''}`}
              onClick={() => setHistoryView('table')}
            >
              Table View
            </button>
            <button
              type="button"
              className={`view-toggle-btn ${historyView === 'timeline' ? 'active' : ''}`}
              onClick={() => setHistoryView('timeline')}
            >
              Timeline View
            </button>
          </div>
        )}
      </div>

      {/* Main Tab Content */}
      <AnimatePresence mode="wait">
        {activeTab === 'overview' ? (
          <motion.div
            key="overview"
            variants={fadeIn}
            initial="initial"
            animate="animate"
            exit="exit"
            className="activity-content-stack"
          >
            {/* 1. Activity Summary Cards */}
            <ActivitySummary {...summaryStats} />

            {/* 2. Cadence Typing Activity Contribution Heatmap */}
            <ActivityHeatmap
              dailyMap={dailyMap}
              selectedYear={selectedYear}
              onYearChange={setSelectedYear}
              onViewTests={handleViewDayTests}
            />

            {/* 3. Performance Trend SVG Chart & Streak System */}
            <div className="activity-duo-grid">
              <PerformanceTrend results={all} />
              <TypingStreak
                currentStreak={summaryStats.currentStreak}
                longestStreak={summaryStats.longestStreak}
                results={all}
              />
            </div>

            {/* 4. "How You Type" & Code Typing Activity */}
            <div className="activity-duo-grid">
              <HowYouType
                keyStats={data.keyStats}
                results={all}
                onPractice={handlePracticeKeys}
              />
              <LanguageActivity results={all} />
            </div>

            {/* 5. Achievement Activity */}
            <AchievementActivity results={all} />
          </motion.div>
        ) : (
          <motion.div
            key="history"
            variants={fadeIn}
            initial="initial"
            animate="animate"
            exit="exit"
            className="activity-history-stack"
          >
            {historyView === 'table' ? (
              <TestHistoryList
                results={all}
                initialFilterDate={filterDate}
                onClearDateFilter={() => setFilterDate(null)}
              />
            ) : (
              <TestHistoryTimeline results={all} />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
