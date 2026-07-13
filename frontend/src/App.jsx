import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'

const ROLES = [
  { id: 'Location Manager',       label: 'Location Manager',  abbr: 'LM', color: '#D97706' },
  { id: 'Director',               label: 'Director',          abbr: 'DR', color: '#0D9488' },
  { id: 'Producer',               label: 'Producer',          abbr: 'PR', color: '#7C3AED' },
  { id: 'Production Designer',    label: 'Prod. Designer',    abbr: 'PD', color: '#2563EB' },
  { id: 'Assistant Director (AD)',label: 'Assistant Director', abbr: 'AD', color: '#DB2777' },
]

const PARTICIPANTS = [
  { name: 'Maya Chen',    role: 'Location Manager',        online: true  },
  { name: 'James Park',   role: 'Director',                online: true  },
  { name: 'Sofia R.',     role: 'Producer',                online: true  },
  { name: 'Leo Vasquez',  role: 'Production Designer',     online: false },
  { name: 'Dana Kim',     role: 'Assistant Director (AD)', online: true  },
]

const SUGGESTED_PROMPTS = [
  "Is Downtown LA's Arts District inside the TMZ zone?",
  "What's the permit lead time for a 80-person crew on city streets?",
  "What are the noise ordinance hours for residential filming?",
  "How much does truck parking affect logistics for Venice Beach?",
]

const card = { background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: 8, padding: '12px 16px', marginBottom: 10 }
const lbl  = { fontSize: 10, color: 'var(--text-label)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 5, display: 'block' }
const inputSt = { width: '100%', padding: '9px 12px', background: 'var(--bg-input)', border: '1px solid var(--border-bright)', borderRadius: 7, color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }

// ─── Hook: detect mobile ──────────────────────────────────────────────────────
function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < breakpoint)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < breakpoint)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [breakpoint])
  return isMobile
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function RoleBadge({ role, size = 'sm' }) {
  const r = ROLES.find(x => x.id === role) || ROLES[0]
  const pad = size === 'xs' ? '1px 5px' : '2px 8px'
  return (
    <span style={{ fontSize: size === 'xs' ? 9 : 10, padding: pad, borderRadius: 4, background: r.color + '15', color: r.color, border: `1px solid ${r.color}30`, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
      {size === 'xs' ? r.abbr : r.label}
    </span>
  )
}

function Avatar({ role, size = 36, name }) {
  const r = ROLES.find(x => x.id === role) || ROLES[0]
  const initials = name ? name.split(' ').map(w => w[0]).join('').slice(0, 2) : r.abbr
  return (
    <div style={{ width: size, height: size, borderRadius: 8, background: r.color + '18', border: `1.5px solid ${r.color}35`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: size * 0.36, fontWeight: 700, color: r.color, flexShrink: 0, letterSpacing: '0.03em' }}>
      {initials}
    </div>
  )
}

// ─── Custom image renderer for AI map images ──────────────────────────────────
const MapImage = ({ src, alt }) => {
  const isEmbed = src?.includes('openstreetmap.org/export/embed')
  return (
    <div style={{ margin: '10px 0' }}>
      {isEmbed ? (
        <iframe
          src={src}
          style={{
            width: '100%',
            maxWidth: 480,
            height: 220,
            borderRadius: 10,
            border: '1px solid var(--border)',
            display: 'block',
            boxShadow: '0 2px 8px rgba(15,23,42,0.08)',
          }}
          title={alt}
          loading="lazy"
        />
      ) : (
        <img
          src={src}
          alt={alt}
          style={{
            width: '100%',
            maxWidth: 480,
            borderRadius: 10,
            border: '1px solid var(--border)',
            display: 'block',
            boxShadow: '0 2px 8px rgba(15,23,42,0.08)',
          }}
          onError={e => { e.target.style.display = 'none' }}
        />
      )}
      {alt && (
        <div style={{
          fontSize: 10,
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
          marginTop: 4,
          letterSpacing: '0.05em',
        }}>
          📍 {alt}
        </div>
      )}
    </div>
  )
}

function Message({ msg }) {
  const isAI = msg.sender === 'Cinesync'
  const participant = PARTICIPANTS.find(p => p.name === msg.sender)
  const role = participant?.role || msg.role || 'Location Manager'
  return (
    <div style={{ display: 'flex', gap: 10, padding: '12px 14px', background: isAI ? 'rgba(13,148,136,0.04)' : 'transparent', borderLeft: isAI ? '3px solid var(--teal)' : '3px solid transparent', borderBottom: '1px solid var(--border)' }}>
      <Avatar role={isAI ? 'ai' : role} size={32} name={isAI ? 'AI' : msg.sender} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: isAI ? 'var(--teal)' : 'var(--text-primary)', letterSpacing: '0.02em' }}>{msg.sender}</span>
          {isAI
            ? <span style={{ fontSize: 9, padding: '2px 6px', background: 'var(--teal-glow)', color: 'var(--teal)', border: '1px solid rgba(13,148,136,0.25)', borderRadius: 4, fontFamily: 'var(--font-mono)', fontWeight: 600, letterSpacing: '0.08em' }}>AI · RAG</span>
            : <RoleBadge role={role} size="xs" />}
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginLeft: 'auto' }}>{msg.time}</span>
        </div>
        {msg.imageUrl && (
          <div style={{ marginBottom: 8 }}>
            <img src={msg.imageUrl} alt="Location" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8, border: '1px solid var(--border)', objectFit: 'cover' }} />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>📎 location_photo.jpg</div>
          </div>
        )}
        {isAI
          ? (
            <div className="ai-content">
              <ReactMarkdown
                components={{
                  img: ({ src, alt }) => <MapImage src={src} alt={alt} />,
                  // Prevent ReactMarkdown from wrapping images in <p> tags
                  p: ({ children }) => {
                    const hasImage = Array.isArray(children)
                      ? children.some(c => c?.type === MapImage)
                      : children?.type === MapImage
                    return hasImage ? <>{children}</> : <p>{children}</p>
                  },
                }}
              >
                {msg.content}
             </ReactMarkdown>
            </div>
          )
          : <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.65 }}>{msg.content}</p>}
        {isAI && msg.ragSources > 0 && (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            <span style={{ color: 'var(--amber)', fontSize: 10 }}>◆</span>{msg.ragSources} knowledge sources retrieved
          </div>
        )}
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', gap: 10, padding: '12px 14px', background: 'rgba(13,148,136,0.04)', borderLeft: '3px solid var(--teal)', borderBottom: '1px solid var(--border)' }}>
      <Avatar role="ai" size={32} name="AI" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingTop: 6 }}>
        {[0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--teal)', animation: 'pulse 1.2s ease-in-out infinite', animationDelay: `${i*0.2}s`, opacity: 0.6 }} />)}
        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 4, fontFamily: 'var(--font-mono)' }}>Cinesync analyzing...</span>
      </div>
      <style>{`@keyframes pulse{0%,100%{transform:scale(1);opacity:0.3}50%{transform:scale(1.3);opacity:1}}`}</style>
    </div>
  )
}

function Modal({ onClose, width = 480, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backdropFilter: 'blur(2px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width: '100%', maxWidth: width, background: 'var(--bg-modal)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 20px 60px rgba(15,23,42,0.18)', maxHeight: '92vh', overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  )
}

function ModalHeader({ icon, title, subtitle, accentColor, onClose }) {
  return (
    <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-elevated)', position: 'sticky', top: 0, zIndex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 8, background: accentColor + '15', border: `1px solid ${accentColor}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{icon}</div>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: accentColor, letterSpacing: '0.05em' }}>{title}</div>
          {subtitle && <div style={{ fontSize: 10, color: 'var(--text-label)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>{subtitle}</div>}
        </div>
      </div>
      <button onClick={onClose} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-label)', cursor: 'pointer', fontSize: 16, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
    </div>
  )
}

function PrimaryBtn({ onClick, disabled, children, color = 'var(--amber)' }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ padding: '9px 18px', background: disabled ? 'var(--bg-card)' : color, color: disabled ? 'var(--text-muted)' : '#fff', border: disabled ? '1px solid var(--border)' : 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-display)', letterSpacing: '0.06em', cursor: disabled ? 'default' : 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}>
      {children}
    </button>
  )
}

// ─── TMZ Panel ────────────────────────────────────────────────────────────────
function TmzLookupPanel({ onClose }) {
  const [address, setAddress] = useState('')
  const [crewSize, setCrewSize] = useState('50')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const handleLookup = async () => {
    if (!address.trim()) return
    setLoading(true); setResult(null); setError(null)
    try {
      const res = await fetch('/api/tmz-lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: address.trim(), crew_size: parseInt(crewSize) || 50 }) })
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Lookup failed') }
      setResult(await res.json())
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  const inside = result?.inside_tmz
  const statusColor = inside ? '#059669' : '#DC2626'
  const statusBg    = inside ? '#ECFDF5' : '#FEF2F2'
  const statusBorder= inside ? '#6EE7B7' : '#FECACA'

  return (
    <Modal onClose={onClose}>
      <ModalHeader icon="📍" title="TMZ ZONE LOOKUP" subtitle="Thirty Mile Zone — Beverly & La Cienega" accentColor="var(--amber)" onClose={onClose} />
      <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>Location Address</label>
          <input value={address} onChange={e => setAddress(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLookup()} placeholder="e.g. Griffith Observatory, Los Angeles" style={inputSt} />
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Crew Size</label>
            <input type="number" value={crewSize} onChange={e => setCrewSize(e.target.value)} min="1" style={inputSt} />
          </div>
          <PrimaryBtn onClick={handleLookup} disabled={loading || !address.trim()} color="var(--amber)">
            {loading ? 'CHECKING...' : 'CHECK TMZ'}
          </PrimaryBtn>
        </div>
      </div>
      {error && <div style={{ padding: '12px 18px', background: '#FEF2F2' }}><span style={{ fontSize: 13, color: '#DC2626', fontFamily: 'var(--font-mono)' }}>⚠ {error}</span></div>}
      {result && (
        <div style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 12, background: statusBg, border: `1.5px solid ${statusBorder}`, marginBottom: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: statusColor + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>{inside ? '✅' : '⚠️'}</div>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: statusColor }}>{result.status_label}</div>
              <div style={{ fontSize: 11, color: statusColor, fontFamily: 'var(--font-mono)', marginTop: 2, opacity: 0.75 }}>{result.distance_miles} mi from center · {result.miles_from_boundary} mi {inside ? 'inside' : 'outside'} boundary</div>
            </div>
          </div>
          <div style={card}>
            <span style={lbl}>Resolved Address</span>
            <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5, marginBottom: 4, fontWeight: 500 }}>{result.resolved_address}</div>
            <div style={{ fontSize: 11, color: 'var(--text-label)', fontFamily: 'var(--font-mono)' }}>{result.latitude}, {result.longitude}</div>
          </div>
          <div style={{ ...card, background: '#FFFBEB', border: '1px solid #FDE68A' }}>
            <span style={{ ...lbl, color: 'var(--amber-dim)' }}>💰 Budget Impact</span>
            <div style={{ fontSize: 13, color: '#78350F', lineHeight: 1.65 }}>{result.budget_impact}</div>
          </div>
          <div style={{ ...card, background: '#F0FDFA', border: '1px solid #99F6E4', marginBottom: 0 }}>
            <span style={{ ...lbl, color: 'var(--teal-dim)' }}>⚖️ Union Implications</span>
            <div style={{ fontSize: 13, color: '#134E4A', lineHeight: 1.65 }}>{result.union_implications}</div>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ─── Sun Path Diagram ─────────────────────────────────────────────────────────
function SunPathDiagram({ result }) {
  const W = 440, H = 200, cx = W / 2, cy = H - 8, R = 168

  const toMins = (str) => {
    if (!str) return 0
    const [time, period] = str.split(' ')
    let [h, m] = time.split(':').map(Number)
    if (period === 'PM' && h !== 12) h += 12
    if (period === 'AM' && h === 12) h = 0
    return h * 60 + m
  }

  const sunriseMins = toMins(result.sunrise)
  const span = toMins(result.sunset) - sunriseMins

  const timeToPoint = (str) => {
    const t = Math.max(0, Math.min(1, (toMins(str) - sunriseMins) / span))
    return { x: cx - R * Math.cos(Math.PI - t * Math.PI), y: cy - R * Math.sin(t * Math.PI) }
  }

  const arcSeg = (t1, t2) => {
    const p1 = timeToPoint(t1), p2 = timeToPoint(t2)
    return `M ${p1.x} ${p1.y} A ${R} ${R} 0 0 1 ${p2.x} ${p2.y}`
  }

  const markers = [
    { time: result.sunrise, color: '#F59E0B' },
    { time: result.golden_hour_morning_end, color: '#FCD34D' },
    { time: result.golden_hour_evening_start, color: '#FCD34D' },
    { time: result.sunset, color: '#F59E0B' },
  ]

  const getOffset = (pt) => {
    const left = pt.x < cx * 0.5, right = pt.x > cx + cx * 0.5
    return { dx: left ? -6 : right ? 6 : 0, dy: pt.y < cy * 0.35 ? -18 : -13, anchor: left ? 'end' : right ? 'start' : 'middle' }
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs>
        <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#BFDBFE" /><stop offset="70%" stopColor="#E0F2FE" /><stop offset="100%" stopColor="#FEF3C7" />
        </linearGradient>
        <linearGradient id="groundGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#D4B896" /><stop offset="100%" stopColor="#C4A882" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width={W} height={cy} fill="url(#skyGrad)" />
      <rect x="0" y={cy} width={W} height={H - cy} fill="url(#groundGrad)" />
      <line x1={14} y1={cy} x2={W - 14} y2={cy} stroke="#C2956A" strokeWidth="1.5" opacity="0.7" />
      <path d={`M ${timeToPoint(result.sunrise).x} ${timeToPoint(result.sunrise).y} A ${R} ${R} 0 0 1 ${timeToPoint(result.sunset).x} ${timeToPoint(result.sunset).y}`} fill="none" stroke="#93C5FD" strokeWidth="6" strokeLinecap="round" opacity="0.5" />
      <path d={arcSeg(result.golden_hour_morning_start, result.golden_hour_morning_end)} fill="none" stroke="#D97706" strokeWidth="7" strokeLinecap="round" opacity="0.85" />
      <path d={arcSeg(result.golden_hour_evening_start, result.golden_hour_evening_end)} fill="none" stroke="#D97706" strokeWidth="7" strokeLinecap="round" opacity="0.85" />
      <path d={arcSeg(result.sunset, result.dusk)} fill="none" stroke="#0D9488" strokeWidth="5" strokeLinecap="round" opacity="0.75" />
      {markers.map(({ time, color }, i) => {
        const pt = timeToPoint(time), { dx, dy, anchor } = getOffset(pt)
        return (
          <g key={i}>
            <circle cx={pt.x} cy={pt.y} r={5} fill={color} stroke="white" strokeWidth="1.5" />
            <text x={pt.x + dx} y={pt.y + dy} textAnchor={anchor} fontSize="9" fill="#1E3A5F" fontFamily="monospace" fontWeight="700">{time}</text>
          </g>
        )
      })}
      {(() => {
        const pt = timeToPoint(result.solar_noon)
        return (
          <g>
            <circle cx={pt.x} cy={pt.y} r={13} fill="#FEF08A" opacity="0.6" />
            <circle cx={pt.x} cy={pt.y} r={9} fill="#FBBF24" />
            <circle cx={pt.x} cy={pt.y} r={18} fill="none" stroke="#FBBF24" strokeWidth="1.5" opacity="0.25" />
            <text x={pt.x} y={pt.y - 24} textAnchor="middle" fontSize="9" fill="#92400E" fontFamily="monospace" fontWeight="700">{result.solar_noon}</text>
          </g>
        )
      })()}
      <text x={22} y={cy + 16} fontSize="10" fill="#78716C" fontFamily="monospace" fontWeight="600">EAST</text>
      <text x={W - 54} y={cy + 16} fontSize="10" fill="#78716C" fontFamily="monospace" fontWeight="600">WEST</text>
      <rect x={14} y={12} width={10} height={4} rx="2" fill="#D97706" />
      <text x={28} y={19} fontSize="9" fill="#6B7280" fontFamily="monospace">Golden Hour</text>
      <rect x={118} y={12} width={10} height={4} rx="2" fill="#0D9488" />
      <text x={132} y={19} fontSize="9" fill="#6B7280" fontFamily="monospace">Blue Hour</text>
    </svg>
  )
}

// ─── Sun Path Panel ───────────────────────────────────────────────────────────
function SunPathPanel({ onClose }) {
  const [address, setAddress] = useState('')
  const [shootDate, setShootDate] = useState(new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const handleLookup = async () => {
    if (!address.trim()) return
    setLoading(true); setResult(null); setError(null)
    try {
      const res = await fetch('/api/sun-path', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: address.trim(), shoot_date: shootDate }) })
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Lookup failed') }
      setResult(await res.json())
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  const windowStyle = {
    golden: { bg: '#FFFBEB', border: '#FDE68A', label: '#B45309', text: '#78350F' },
    neutral: { bg: 'var(--bg-card)', border: 'var(--border-card)', label: 'var(--text-label)', text: 'var(--text-secondary)' },
    blue:    { bg: '#F0FDFA', border: '#99F6E4', label: '#0F766E', text: '#134E4A' },
  }

  return (
    <Modal onClose={onClose} width={520}>
      <ModalHeader icon="☀️" title="SUN PATH ANALYZER" subtitle="Golden hour, blue hour & shooting windows" accentColor="#B45309" onClose={onClose} />
      <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>Location Address</label>
          <input value={address} onChange={e => setAddress(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLookup()} placeholder="e.g. Griffith Observatory, Los Angeles" style={inputSt} />
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={lbl}>Shoot Date</label>
            <input type="date" value={shootDate} onChange={e => setShootDate(e.target.value)} style={inputSt} />
          </div>
          <PrimaryBtn onClick={handleLookup} disabled={loading || !address.trim()} color="#B45309">
            {loading ? 'CALCULATING...' : 'ANALYZE'}
          </PrimaryBtn>
        </div>
      </div>
      {error && <div style={{ padding: '12px 18px', background: '#FEF2F2' }}><span style={{ fontSize: 13, color: '#DC2626', fontFamily: 'var(--font-mono)' }}>⚠ {error}</span></div>}
      {result && (
        <div style={{ padding: '16px 18px' }}>
          <div style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>{result.resolved_address.split(',').slice(0, 2).join(',')}</div>
            <div style={{ fontSize: 12, color: 'var(--text-label)', fontFamily: 'var(--font-mono)', flexShrink: 0, marginLeft: 10 }}>{result.total_daylight_hours}h daylight</div>
          </div>
          <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 14 }}>
            <SunPathDiagram result={result} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
            {[
              { lbl: 'Sunrise', val: result.sunrise, bg: '#FFFBEB', border: '#FDE68A', color: '#B45309' },
              { lbl: 'Solar Noon', val: result.solar_noon, bg: '#FEFCE8', border: '#FEF08A', color: '#A16207' },
              { lbl: 'Sunset', val: result.sunset, bg: '#FFFBEB', border: '#FDE68A', color: '#B45309' },
            ].map(({ lbl: l, val, bg, border, color }) => (
              <div key={l} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: 9, color, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3 }}>{l}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color, fontFamily: 'var(--font-display)' }}>{val}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-label)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Shooting Windows</div>
          {result.shooting_windows.map((w, i) => {
            const s = windowStyle[w.type] || windowStyle.neutral
            return (
              <div key={i} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 10, padding: '10px 14px', marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap', gap: 4 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: s.label, fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>{w.label}</div>
                  <div style={{ fontSize: 10, color: s.label, fontFamily: 'var(--font-mono)', opacity: 0.8 }}>{w.start} – {w.end}</div>
                </div>
                <div style={{ fontSize: 10, color: s.label, marginBottom: 3, fontFamily: 'var(--font-mono)', fontWeight: 600, opacity: 0.75 }}>{w.direction}</div>
                <div style={{ fontSize: 12, color: s.text, lineHeight: 1.6 }}>{w.notes}</div>
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}

// ─── Sidebar content ──────────────────────────────────────────────────────────
function SidebarContent({ backendStatus, setShowTmzLookup, setShowSunPath, onClose }) {
  return (
    <>
      <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--amber)' }}>
            CINESYNC<span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>AI</span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-label)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>Film Location Intelligence</div>
        </div>
        {onClose && (
          <button onClick={onClose} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-label)', cursor: 'pointer', fontSize: 18, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        )}
      </div>

      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, fontFamily: 'var(--font-mono)' }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: backendStatus === 'ok' ? '#10B981' : backendStatus === 'error' ? '#EF4444' : '#F59E0B', boxShadow: backendStatus === 'ok' ? '0 0 6px #10B981' : 'none' }} />
          <span style={{ color: 'var(--text-label)' }}>{backendStatus === 'ok' ? 'RAG Engine Online' : backendStatus === 'error' ? 'Backend Offline' : 'Connecting...'}</span>
        </div>
      </div>

      <div style={{ padding: '12px 16px 8px' }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', marginBottom: 8 }}>CHANNEL</div>
        <div style={{ padding: '7px 10px', borderRadius: 8, background: 'var(--amber-glow)', border: '1px solid rgba(217,119,6,0.2)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--amber)', fontSize: 13 }}>🎬</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>location-scout</span>
        </div>
      </div>

      <div style={{ padding: '0 16px 12px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', marginBottom: 8 }}>TOOLS</div>
        {[
          { icon: '📍', label: 'TMZ LOOKUP', sub: 'Check any address', color: 'var(--amber)', hoverBg: 'var(--amber-glow)', hoverBorder: 'rgba(217,119,6,0.3)', action: () => { setShowTmzLookup(true); onClose?.() } },
          { icon: '☀️', label: 'SUN PATH', sub: 'Golden hour & windows', color: '#B45309', hoverBg: '#FFFBEB', hoverBorder: '#FDE68A', action: () => { setShowSunPath(true); onClose?.() } },
        ].map((tool, i) => (
          <button key={i} onClick={tool.action} style={{ width: '100%', padding: '9px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', textAlign: 'left', marginBottom: i === 0 ? 7 : 0, transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = tool.hoverBg; e.currentTarget.style.borderColor = tool.hoverBorder }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.borderColor = 'var(--border)' }}>
            <span style={{ fontSize: 15 }}>{tool.icon}</span>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: tool.color, fontFamily: 'var(--font-display)', letterSpacing: '0.05em' }}>{tool.label}</div>
              <div style={{ fontSize: 10, color: 'var(--text-label)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>{tool.sub}</div>
            </div>
          </button>
        ))}
      </div>

      <div style={{ padding: '12px 16px', flex: 1, overflowY: 'auto' }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', marginBottom: 10 }}>PARTICIPANTS — {PARTICIPANTS.length}</div>
        {PARTICIPANTS.map(p => {
          const r = ROLES.find(x => x.id === p.role) || ROLES[0]
          return (
            <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
              <div style={{ position: 'relative' }}>
                <Avatar role={p.role} size={30} name={p.name} />
                <div style={{ position: 'absolute', bottom: -1, right: -1, width: 7, height: 7, borderRadius: '50%', background: p.online ? '#10B981' : '#D1D5DB', border: '1.5px solid white' }} />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>{p.name}</div>
                <div style={{ fontSize: 10, color: r.color, fontWeight: 500 }}>{p.role.replace('Assistant Director (AD)', 'Asst. Director')}</div>
              </div>
            </div>
          )
        })}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 4, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <div style={{ position: 'relative' }}>
            <Avatar role="ai" size={30} name="AI" />
            <div style={{ position: 'absolute', bottom: -1, right: -1, width: 7, height: 7, borderRadius: '50%', background: '#10B981', border: '1.5px solid white' }} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--teal)', lineHeight: 1.2 }}>Cinesync</div>
            <div style={{ fontSize: 10, color: 'var(--text-label)' }}>AI Expert</div>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Initial messages ─────────────────────────────────────────────────────────
const now = new Date()
const fmt = (d) => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

const INITIAL_MESSAGES = [
  { id: 1, sender: 'Maya Chen', role: 'Location Manager', content: "Team — I found a great potential location in the Arts District. Uploading now for AI review.", time: fmt(new Date(now - 8*60000)) },
  { id: 2, sender: 'Cinesync', role: 'ai', content: `📍 **LOCATION ASSESSMENT** — Arts District, Downtown LA\nStatus: **INSIDE TMZ** ✅ No travel pay triggered.\n\n⏱️ **PERMIT REQUIREMENTS**\nFor a 60-person crew on a public street: **Category 3 permit**. Lead time: 5–10 business days. Estimated base fee: ~$2,500 + location fee $1,200–3,500/day.\n\n💰 **BUDGET IMPACT**\nTMZ compliance confirmed — no hotel/per diem costs. LAPD film detail required for street work: ~$45/hr per officer.\n\n⚠️ **FLAGS & RISKS**\nIndustrial/residential mixed zone — noise ordinance hours apply: **7AM–10PM weekdays**.\n\n🎬 **CREATIVE NOTES**\nArts District brick facades excellent for gritty urban aesthetic. East-facing buildings get best light 7–11AM.\n\n![Map — Arts District](https://www.openstreetmap.org/export/embed.html?bbox=-118.2431,34.0307,-118.2231,34.0507&layer=mapnik&marker=34.0407,-118.2331)`, time: fmt(new Date(now - 7*60000)), ragSources: 4 },
  { id: 3, sender: 'James Park', role: 'Director', content: "Good. What's the sunset timing for a west-facing exterior? We need at least 45 minutes of magic hour.", time: fmt(new Date(now - 5*60000)) },
  { id: 4, sender: 'Cinesync', role: 'ai', content: `🎬 **NATURAL LIGHT — West-Facing Exterior**\n\n- **Golden hour begins:** ~5:45 PM\n- **Magic hour window:** approximately 5:45–7:00 PM (75 min total)\n- **Shadow intrusion risk:** Neighboring buildings create shadow creep after 6:30 PM\n\n**Recommendation:** Schedule west-facing exteriors with camera rolling by 5:30 PM.\n\n⚠️ Noise ordinance: wrap by **10:00 PM** on weekdays.`, time: fmt(new Date(now - 4*60000)), ragSources: 2 },
  { id: 5, sender: 'Sofia R.', role: 'Producer', content: "Great. Can we fit 3 semi trucks on the street or do we need a separate basecamp location?", time: fmt(new Date(now - 2*60000)) },
]

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [messages, setMessages] = useState(INITIAL_MESSAGES)
  const [input, setInput] = useState('')
  const [selectedRole, setSelectedRole] = useState('Location Manager')
  const [pendingImage, setPendingImage] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [backendStatus, setBackendStatus] = useState('checking')
  const [history, setHistory] = useState([])
  const [showTmzLookup, setShowTmzLookup] = useState(false)
  const [showSunPath, setShowSunPath] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const isMobile = useIsMobile()
  const fileInputRef = useRef(null)
  const chatEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    fetch('/health').then(r => r.json()).then(d => setBackendStatus(d.status === 'ok' ? 'ok' : 'error')).catch(() => setBackendStatus('error'))
  }, [])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, isLoading])
  useEffect(() => { if (!isMobile) setSidebarOpen(false) }, [isMobile])

  const handleImageUpload = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = e => setPendingImage({ base64: e.target.result.split(',')[1], url: e.target.result, type: file.type })
    reader.readAsDataURL(file)
  }, [])

  const handleDrop = useCallback((e) => { e.preventDefault(); handleImageUpload(e.dataTransfer.files[0]) }, [handleImageUpload])

  const sendMessage = async () => {
    const text = input.trim()
    if (!text && !pendingImage) return
    const participant = PARTICIPANTS.find(p => p.role === selectedRole)
    const userMsg = { id: Date.now(), sender: participant?.name || selectedRole, role: selectedRole, content: text || '📎 Uploaded location photo for analysis.', imageUrl: pendingImage?.url || null, time: fmt(new Date()) }
    setMessages(prev => [...prev, userMsg])
    setInput(''); setPendingImage(null); setIsLoading(true)
    const newHistory = [...history, { role: 'user', content: text || 'Please analyze this location photo.' }]
    try {
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text || 'Please analyze this uploaded location photo.', user_role: selectedRole, conversation_history: history, ...(pendingImage && { image_base64: pendingImage.base64, image_media_type: pendingImage.type }) }) })
      if (!res.ok) throw new Error(`Server error: ${res.status}`)
      const data = await res.json()
      setMessages(prev => [...prev, { id: Date.now()+1, sender: 'Cinesync', role: 'ai', content: data.response, time: fmt(new Date()), ragSources: data.rag_sources_used }])
      setHistory([...newHistory, { role: 'assistant', content: data.response }])
    } catch (err) {
      setMessages(prev => [...prev, { id: Date.now()+1, sender: 'Cinesync', role: 'ai', content: `⚠️ **Connection error.** Could not reach backend: ${err.message}`, time: fmt(new Date()), ragSources: 0 }])
    } finally { setIsLoading(false) }
  }

  const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }
  const currentRole = ROLES.find(r => r.id === selectedRole)

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: 'var(--font-body)', background: 'var(--bg-base)' }}>
      {showTmzLookup && <TmzLookupPanel onClose={() => setShowTmzLookup(false)} />}
      {showSunPath && <SunPathPanel onClose={() => setShowSunPath(false)} />}

      {/* ── Mobile drawer overlay ── */}
      {isMobile && sidebarOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(2px)' }} onClick={() => setSidebarOpen(false)} />
          <div style={{ position: 'relative', width: 260, background: 'var(--bg-surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', height: '100%', zIndex: 1, boxShadow: '4px 0 20px rgba(15,23,42,0.15)' }}>
            <SidebarContent backendStatus={backendStatus} setShowTmzLookup={setShowTmzLookup} setShowSunPath={setShowSunPath} onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* ── Desktop sidebar ── */}
      {!isMobile && (
        <div style={{ width: 248, flexShrink: 0, background: 'var(--bg-surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', boxShadow: '2px 0 8px rgba(15,23,42,0.05)' }}>
          <SidebarContent backendStatus={backendStatus} setShowTmzLookup={setShowTmzLookup} setShowSunPath={setShowSunPath} />
        </div>
      )}

      {/* ── Main chat ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* Header */}
        <div style={{ padding: isMobile ? '10px 14px' : '14px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, boxShadow: '0 1px 4px rgba(15,23,42,0.05)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            {isMobile && (
              <button onClick={() => setSidebarOpen(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[0,1,2].map(i => <div key={i} style={{ width: 20, height: 2, background: 'var(--amber)', borderRadius: 2 }} />)}
              </button>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {!isMobile && <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--amber)', letterSpacing: '0.05em' }}>CINESYNC<span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>AI</span></span>}
                <span style={{ fontSize: isMobile ? 13 : 14, fontWeight: 600, color: 'var(--text-primary)' }}># location-scout</span>
                <span style={{ fontSize: 9, padding: '2px 6px', background: 'var(--amber-glow)', color: 'var(--amber)', border: '1px solid rgba(217,119,6,0.25)', borderRadius: 4, fontFamily: 'var(--font-mono)', fontWeight: 600, flexShrink: 0 }}>LIVE</span>
              </div>
              {!isMobile && <div style={{ fontSize: 11, color: 'var(--text-label)', marginTop: 2 }}>Real-time AI-assisted location compliance &amp; scouting</div>}
            </div>
          </div>
          <select value={selectedRole} onChange={e => setSelectedRole(e.target.value)}
            style={{ background: 'var(--bg-input)', border: `1.5px solid ${currentRole?.color || 'var(--border)'}50`, color: currentRole?.color || 'var(--text-primary)', padding: isMobile ? '5px 6px' : '5px 10px', borderRadius: 7, fontSize: isMobile ? 11 : 13, fontFamily: 'var(--font-display)', fontWeight: 700, cursor: 'pointer', outline: 'none', letterSpacing: '0.03em', flexShrink: 0, maxWidth: isMobile ? 110 : 'none' }}>
            {ROLES.map(r => <option key={r.id} value={r.id}>{isMobile ? r.abbr : r.label}</option>)}
          </select>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-base)' }}>
          {messages.map(msg => <Message key={msg.id} msg={msg} />)}
          {isLoading && <TypingIndicator />}
          <div ref={chatEndRef} />
        </div>

        {/* Suggested prompts */}
        {messages.length <= 5 && (
          <div style={{ padding: '6px 12px', background: 'var(--bg-surface)', borderTop: '1px solid var(--border)', display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
            {SUGGESTED_PROMPTS.map(p => (
              <button key={p} onClick={() => { setInput(p); inputRef.current?.focus() }}
                style={{ padding: '4px 10px', borderRadius: 20, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-body)' }}
                onMouseEnter={e => { e.target.style.borderColor = 'var(--amber)'; e.target.style.color = 'var(--amber)'; e.target.style.background = 'var(--amber-glow)' }}
                onMouseLeave={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.color = 'var(--text-secondary)'; e.target.style.background = 'var(--bg-card)' }}>
                {p}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div style={{ padding: isMobile ? '8px 12px 14px' : '12px 22px 16px', background: 'var(--bg-surface)', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          {pendingImage && (
            <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <img src={pendingImage.url} alt="preview" style={{ width: 40, height: 30, objectFit: 'cover', borderRadius: 5, border: '1px solid var(--border)' }} />
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>Photo ready for analysis</span>
              <button onClick={() => setPendingImage(null)} style={{ marginLeft: 'auto', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--text-label)', cursor: 'pointer', fontSize: 14, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
          )}
          <div onDrop={handleDrop} onDragOver={e => e.preventDefault()}
            style={{ display: 'flex', gap: 8, alignItems: 'flex-end', padding: '8px 12px', background: 'var(--bg-input)', border: '1.5px solid var(--border-bright)', borderRadius: 12, boxShadow: '0 1px 3px rgba(15,23,42,0.06)' }}>
            <button onClick={() => fileInputRef.current?.click()} title="Upload photo"
              style={{ background: 'none', border: 'none', color: 'var(--text-label)', cursor: 'pointer', fontSize: 17, padding: '2px 3px', flexShrink: 0 }}
              onMouseEnter={e => e.target.style.color = 'var(--amber)'}
              onMouseLeave={e => e.target.style.color = 'var(--text-label)'}>📎</button>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleImageUpload(e.target.files[0])} />
            <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
              placeholder={`Message as ${ROLES.find(r => r.id === selectedRole)?.abbr}...`}
              rows={1} style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: 14, fontFamily: 'var(--font-body)', resize: 'none', lineHeight: 1.5, maxHeight: 100, overflow: 'auto' }} />
            <button onClick={sendMessage} disabled={isLoading || (!input.trim() && !pendingImage)}
              style={{ background: isLoading || (!input.trim() && !pendingImage) ? 'var(--bg-card)' : 'var(--amber)', color: isLoading || (!input.trim() && !pendingImage) ? 'var(--text-muted)' : '#fff', border: isLoading || (!input.trim() && !pendingImage) ? '1px solid var(--border)' : 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-display)', letterSpacing: '0.06em', cursor: isLoading || (!input.trim() && !pendingImage) ? 'default' : 'pointer', flexShrink: 0 }}>
              {isLoading ? '...' : 'SEND'}
            </button>
          </div>
          {!isMobile && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
              Enter to send · Shift+Enter for new line · Drop images directly into chat
            </div>
          )}
        </div>
      </div>
    </div>
  )
}