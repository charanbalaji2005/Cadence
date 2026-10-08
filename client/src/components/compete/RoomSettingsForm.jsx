import { Clock, Type, Quote, Wrench, AtSign, Hash, Users } from 'lucide-react';
import { TIME_OPTIONS, WORD_OPTIONS, QUOTE_OPTIONS, CUSTOM_TEXT_MAX, MAX_PLAYERS } from '../../lib/compete.js';

const MODES = [['time', Clock, 'Time'], ['words', Type, 'Words'], ['quote', Quote, 'Quote'], ['custom', Wrench, 'Custom']];

function Seg({ label, options, value, onChange, disabled, render = o => o }) {
  return (
    <div className="seg cp-seg" role="group" aria-label={label}>
      {options.map(o => (
        <button key={o} type="button" aria-pressed={value === o} disabled={disabled} onClick={() => onChange(o)}>{render(o)}</button>
      ))}
    </div>
  );
}

/**
 * Race settings, shared by the create dialog and the host's lobby controls.
 * Zen isn't offered: a race needs the same target text for everyone.
 */
export default function RoomSettingsForm({ value, onChange, disabled = false, idPrefix = 'rs' }) {
  const s = value;
  const set = patch => onChange({ ...s, ...patch });
  const extras = s.mode === 'time' || s.mode === 'words';
  return (
    <div className="cp-form">
      <div className="cp-row">
        <span className="cp-label" id={`${idPrefix}-mode`}>Mode</span>
        <div className="seg cp-seg cp-modes" role="group" aria-labelledby={`${idPrefix}-mode`}>
          {MODES.map(([m, Icon, label]) => (
            <button key={m} type="button" aria-pressed={s.mode === m} disabled={disabled} onClick={() => set({ mode: m })}><Icon size="1em" />{label}</button>
          ))}
        </div>
      </div>
      {s.mode === 'time' && (
        <div className="cp-row"><span className="cp-label">Duration</span>
          <Seg label="Duration in seconds" options={TIME_OPTIONS} value={s.time} disabled={disabled} onChange={time => set({ time })} render={t => `${t}s`} />
        </div>
      )}
      {s.mode === 'words' && (
        <div className="cp-row"><span className="cp-label">Words</span>
          <Seg label="Number of words" options={WORD_OPTIONS} value={s.words} disabled={disabled} onChange={words => set({ words })} />
        </div>
      )}
      {s.mode === 'quote' && (
        <div className="cp-row"><span className="cp-label">Length</span>
          <Seg label="Quote length" options={QUOTE_OPTIONS} value={s.quoteLen} disabled={disabled} onChange={quoteLen => set({ quoteLen })} />
        </div>
      )}
      {extras && (
        <div className="cp-row"><span className="cp-label">Extras</span>
          <div className="seg cp-seg" role="group" aria-label="Extras">
            <button type="button" aria-pressed={s.punctuation} disabled={disabled} onClick={() => set({ punctuation: !s.punctuation })}><AtSign size="1em" />punctuation</button>
            <button type="button" aria-pressed={s.numbers} disabled={disabled} onClick={() => set({ numbers: !s.numbers })}><Hash size="1em" />numbers</button>
          </div>
        </div>
      )}
      {s.mode === 'custom' && (
        <div className="field cp-custom">
          <label htmlFor={`${idPrefix}-text`}>Race text</label>
          <textarea id={`${idPrefix}-text`} value={s.customText} maxLength={CUSTOM_TEXT_MAX} disabled={disabled} placeholder="Paste the text everyone will type."
            onChange={e => set({ customText: e.target.value })} />
          <span className="hint">{s.customText.length} / {CUSTOM_TEXT_MAX}</span>
        </div>
      )}
      <div className="cp-row">
        <span className="cp-label">Players</span>
        <span className="cp-static"><Users size="1em" />Up to {MAX_PLAYERS} players</span>
      </div>
    </div>
  );
}
