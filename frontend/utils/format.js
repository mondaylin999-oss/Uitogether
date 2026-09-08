/* ==========================================================================
   utils/format.js - turning API values into human-readable text.
   Enum labels mirror backend/config/constants.js.
   ========================================================================== */
(function (window) {
  'use strict';

  const UIT = window.UIT;
  const { escapeHtml } = UIT;

  const STUDY_STYLE_LABELS = {
    solo_focus: 'Solo focus',
    group_discussion: 'Group discussion',
    quiet_library: 'Quiet library',
    online_call: 'Online call',
    mixed: 'Mixed',
  };
  const WANNA_MEET_LABELS = { online: 'Online', in_person: 'In person', both: 'Online or in person' };

  function titleCase(value) {
    if (!value) return '';
    return String(value).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  const labelStudyStyle = (v) => STUDY_STYLE_LABELS[v] || titleCase(v);
  const labelWannaMeet  = (v) => WANNA_MEET_LABELS[v] || titleCase(v);

  /** "2026-09-20" -> "20 Sep 2026". Parsed manually so no timezone can shift the day. */
  function formatDate(value) {
    if (!value) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
    if (!m) return escapeHtml(value);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}`;
  }

  /** "09:00:00" -> "9:00 AM" */
  function formatTime(value) {
    if (!value) return '';
    const m = /^(\d{2}):(\d{2})/.exec(String(value));
    if (!m) return escapeHtml(value);
    let h = Number(m[1]);
    const suffix = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m[2]} ${suffix}`;
  }

  /** ISO timestamp -> "3 hours ago" */
  function timeAgo(value) {
    if (!value) return '';
    const then = new Date(value).getTime();
    if (Number.isNaN(then)) return '';
    const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
    if (secs < 60) return 'just now';
    const mins = Math.round(secs / 60);
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
    const days = Math.round(hrs / 24);
    if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
    return formatDate(value);
  }

  /** "Aung Kyaw" -> "AK" */
  function initials(name) {
    const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  /** "Java, Maths" -> ["Java", "Maths"] */
  const toList = (value) => (value
    ? String(value).split(',').map((i) => i.trim()).filter(Boolean)
    : []);

  Object.assign(UIT, {
    STUDY_STYLE_LABELS, WANNA_MEET_LABELS,
    titleCase, labelStudyStyle, labelWannaMeet,
    formatDate, formatTime, timeAgo, initials, toList,
  });
})(window);
