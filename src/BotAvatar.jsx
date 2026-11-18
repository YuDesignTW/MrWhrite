import React from 'react';
import './bot-avatar.css';

// Small original vector characters: no image downloads or animation runtime.
const characters = {
  director: { color: '#efefed', path: 'M4 8 3 3 9 6 13 1 17 6 23 3 22 9C25 18 20 23 13 23S1 18 4 8Z' },
  social: { color: '#ff3495', path: 'M13 3C6 3 2 7 2 13c0 4 2 6 5 8l-1 4 6-3c7 1 12-3 12-9S20 3 13 3Z' },
  analyst: { color: '#929496', path: 'M3 10Q3 8 5 8h3V5q0-2 2-2h4v3h4V2h3q2 0 2 3v13q0 5-5 5H8q-5 0-5-5Z' },
  designer: { color: '#00cc88', path: 'M11 7 14 1q1-1 2 0l1 7c5 2 8 6 6 10-2 5-8 6-14 4-5-1-7-5-5-9 1-3 4-5 7-6Z' },
  writer: { color: '#a264ff', path: 'M13 1 22 10q3 4 0 8l-8 7-9-7q-4-4-1-8Z' },
  video: { color: '#ffb648', path: 'M6 5h11q3 0 3 4l5-3v15l-5-3q0 4-4 4H7q-5 0-5-5v-7q0-5 4-5Z' },
  research: { color: '#159dff', path: 'M3 9 5 4q1-2 4-1l3 2h3l3-2q3-1 4 2l2 8q2 9-5 10-5 0-6-4-2 4-6 4-7-1-4-14Z' },
};

export function BotAvatar({ member, small = false }) {
  const character = characters[member.id] || characters[member.capability] || characters.director;
  return <span aria-hidden="true" className={`tw-avatar tw-bot-avatar ${small ? 'small' : ''}`}>
    <svg viewBox="0 0 26 26" focusable="false" className={`tw-character tw-character-${member.id}`}>
      <g className="tw-bot-reaction">
        <path fill={character.color} d={character.path} />
        <g className="tw-bot-gaze" fill="#171717">
          <g className="tw-bot-eye tw-bot-eye-left"><rect x="9" y="10" width="2.2" height="6.2" rx="1.1" /></g>
          <g className="tw-bot-eye tw-bot-eye-right"><rect x="15" y="9.5" width="2.2" height="6.2" rx="1.1" /></g>
          <path className="tw-bot-smile" d="M11.6 18q1.3 1.2 2.6 0" fill="none" stroke="#171717" strokeWidth="1.1" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  </span>;
}

export function lookAtPointer(event) {
  if (event.pointerType !== 'mouse' || !window.matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)').matches) return;
  const row = event.currentTarget;
  const bounds = row.querySelector('.tw-bot-avatar')?.getBoundingClientRect();
  if (!bounds) return;
  const x = Math.tanh((event.clientX - bounds.left - bounds.width / 2) / 85);
  const y = Math.tanh((event.clientY - bounds.top - bounds.height / 2) / 24);
  row.style.setProperty('--look-x', `${(x * 1.7).toFixed(2)}px`);
  row.style.setProperty('--look-y', `${(y * 1.25).toFixed(2)}px`);
  row.style.setProperty('--bot-tilt', `${(x * 5).toFixed(2)}deg`);
  row.style.setProperty('--bot-drift', `${(x * .7).toFixed(2)}px`);
}

export function resetLook(event) {
  for (const property of ['--look-x', '--look-y', '--bot-tilt', '--bot-drift']) event.currentTarget.style.removeProperty(property);
}
