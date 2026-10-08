import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Code2, Terminal } from 'lucide-react';
import { fadeUp } from '../../animations/variants.js';

const KNOWN_LANGUAGES = [
  { id: 'typescript', name: 'TypeScript', color: '#3178c6' },
  { id: 'javascript', name: 'JavaScript', color: '#f7df1e' },
  { id: 'python', name: 'Python', color: '#3776ab' },
  { id: 'cpp', name: 'C++', color: '#00599c' },
  { id: 'java', name: 'Java', color: '#b07219' },
  { id: 'rust', name: 'Rust', color: '#dea584' },
  { id: 'go', name: 'Go', color: '#00add8' },
  { id: 'sql', name: 'SQL', color: '#e38c00' },
  { id: 'html', name: 'HTML', color: '#e34c26' },
  { id: 'css', name: 'CSS', color: '#563d7c' },
  { id: 'bash', name: 'Bash', color: '#89e051' }
];

export default function LanguageActivity({ results = [] }) {
  const breakdown = useMemo(() => {
    // Filter results that were in code mode or custom programming mode
    const codeTests = results.filter(r => r.mode === 'code' || r.mode === 'custom' || (r.mode2 && r.mode2.includes('code')));
    const counts = {};
    let total = 0;

    for (const r of codeTests) {
      const lang = (r.mode2 || 'javascript').toLowerCase();
      const match = KNOWN_LANGUAGES.find(l => lang.includes(l.id)) || { id: 'javascript', name: 'JavaScript', color: '#f7df1e' };
      counts[match.id] = (counts[match.id] || 0) + 1;
      total++;
    }

    // Default demonstration languages if user hasn't typed many code tests yet
    if (total === 0) {
      return [
        { id: 'typescript', name: 'TypeScript', color: '#3178c6', count: 12, pct: 42 },
        { id: 'javascript', name: 'JavaScript', color: '#f7df1e', count: 8, pct: 28 },
        { id: 'python', name: 'Python', color: '#3776ab', count: 5, pct: 18 },
        { id: 'cpp', name: 'C++', color: '#00599c', count: 3, pct: 12 }
      ];
    }

    return Object.entries(counts)
      .map(([id, count]) => {
        const langObj = KNOWN_LANGUAGES.find(l => l.id === id) || { name: id, color: 'var(--accent)' };
        const pct = Math.round((count / total) * 100);
        return { id, name: langObj.name, color: langObj.color, count, pct };
      })
      .sort((a, b) => b.count - a.count);
  }, [results]);

  return (
    <motion.section
      variants={fadeUp}
      initial="initial"
      animate="animate"
      className="language-activity-card glass"
      aria-label="Code Typing Activity Breakdown"
    >
      <div className="language-activity-header">
        <div className="lang-title-row">
          <Code2 size={18} className="lang-icon" />
          <h3 className="language-activity-title">Code Typing Activity</h3>
        </div>
        <span className="lang-sub-note">Language performance breakdown</span>
      </div>

      <div className="language-bars-list">
        {breakdown.map(item => (
          <div key={item.id} className="language-bar-item">
            <div className="language-bar-meta">
              <span className="language-name">
                <span className="lang-color-dot" style={{ backgroundColor: item.color }} />
                {item.name}
              </span>
              <span className="language-pct">{item.pct}%</span>
            </div>

            <div className="language-progress-track">
              <motion.div
                className="language-progress-fill"
                style={{ backgroundColor: item.color }}
                initial={{ width: 0 }}
                whileInView={{ width: `${item.pct}%` }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
          </div>
        ))}
      </div>
    </motion.section>
  );
}
