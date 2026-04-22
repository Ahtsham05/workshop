/**
 * StudentAvatar — shows the student photo if available, otherwise
 * a gender-appropriate silhouette avatar (male = blue, female = pink).
 *
 * Usage (CSS classes):
 *   <StudentAvatar photoUrl={s.photoUrl?.url} gender={s.gender} className="h-8 w-8 rounded-full" />
 *
 * Usage (inline styles, e.g. ID card):
 *   <StudentAvatar photoUrl={s.photoUrl?.url} gender={s.gender}
 *     style={{ width: '15mm', height: '19mm', borderRadius: '1.5mm', border: '0.5mm solid #cbd5e1' }} />
 */

import React from 'react';

interface StudentAvatarProps {
  photoUrl?: string | null;
  gender?: string;
  className?: string;
  style?: React.CSSProperties;
}

/** White male silhouette — wide shoulders */
function MaleSVG() {
  return (
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" aria-hidden="true">
      {/* Head */}
      <circle cx="50" cy="37" r="21" fill="rgba(255,255,255,0.92)" />
      {/* Body / shoulders */}
      <path d="M 0 102 Q 0 70 50 66 Q 100 70 100 102 Z" fill="rgba(255,255,255,0.92)" />
    </svg>
  );
}

/** White female silhouette — hair up top to differentiate */
function FemaleSVG() {
  return (
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" aria-hidden="true">
      {/* Hair (cap behind head) */}
      <path d="M 27 32 Q 50 10 73 32 Q 67 15 50 13 Q 33 15 27 32 Z" fill="rgba(255,255,255,0.85)" />
      {/* Head */}
      <circle cx="50" cy="37" r="20" fill="rgba(255,255,255,0.93)" />
      {/* Body / shoulders (slightly narrower) */}
      <path d="M 8 102 Q 8 70 50 66 Q 92 70 92 102 Z" fill="rgba(255,255,255,0.92)" />
    </svg>
  );
}

export function StudentAvatar({ photoUrl, gender, className = '', style }: StudentAvatarProps) {
  const g = gender?.toLowerCase();
  const isFemale = g === 'female';

  // Background gradient based on gender
  const gradientBg = photoUrl
    ? undefined
    : isFemale
      ? 'linear-gradient(155deg, #f472b6 0%, #be185d 100%)'
      : g === 'male'
        ? 'linear-gradient(155deg, #60a5fa 0%, #1d4ed8 100%)'
        : 'linear-gradient(155deg, #94a3b8 0%, #475569 100%)';

  return (
    <div
      className={`overflow-hidden ${className}`}
      style={{
        ...(gradientBg ? { background: gradientBg } : {}),
        ...style,
        // always clip children to rounded corners
        overflow: 'hidden',
      }}
    >
      {photoUrl ? (
        <img src={photoUrl} alt="Student" className="w-full h-full object-cover" />
      ) : (
        isFemale ? <FemaleSVG /> : <MaleSVG />
      )}
    </div>
  );
}

export default StudentAvatar;
