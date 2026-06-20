import { initApp } from '@freeappstore/sdk'
import { Shell } from '@freeappstore/sdk/ui'
import { useState, useEffect, useCallback, useRef } from 'react'

const fas = initApp({ appId: 'piano' })

// ── Audio engine ──────────────────────────────────────────────
const audioCtx = (): AudioContext => {
  if (!(window as any).__pianoCtx) (window as any).__pianoCtx = new AudioContext()
  return (window as any).__pianoCtx
}

function playNote(freq: number, sustain: boolean) {
  const ctx = audioCtx()
  if (ctx.state === 'suspended') ctx.resume()

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  const filter = ctx.createBiquadFilter()

  // Piano-like tone: triangle + light filtering
  osc.type = 'triangle'
  osc.frequency.value = freq

  filter.type = 'lowpass'
  filter.frequency.value = freq * 4
  filter.Q.value = 1

  gain.gain.setValueAtTime(0.5, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(
    0.001,
    ctx.currentTime + (sustain ? 3.0 : 0.8)
  )

  osc.connect(filter)
  filter.connect(gain)
  gain.connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + (sustain ? 3.0 : 0.8))
}

// ── Note data ─────────────────────────────────────────────────
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

function noteFreq(note: number, octave: number): number {
  // note 0=C, semitones from A4 (A4 = note 9, octave 4)
  const semitonesFromA4 = (octave - 4) * 12 + (note - 9)
  return 440 * Math.pow(2, semitonesFromA4 / 12)
}

interface KeyDef {
  note: number      // 0-11
  octave: number
  name: string
  isBlack: boolean
  freq: number
}

function buildKeys(baseOctave: number): KeyDef[] {
  const keys: KeyDef[] = []
  for (let oct = baseOctave; oct < baseOctave + 2; oct++) {
    for (let n = 0; n < 12; n++) {
      keys.push({
        note: n,
        octave: oct,
        name: NOTE_NAMES[n] + oct,
        isBlack: [1, 3, 6, 8, 10].includes(n),
        freq: noteFreq(n, oct),
      })
    }
  }
  // Add final C
  keys.push({
    note: 0,
    octave: baseOctave + 2,
    name: 'C' + (baseOctave + 2),
    isBlack: false,
    freq: noteFreq(0, baseOctave + 2),
  })
  return keys
}

// ── Keyboard mapping ──────────────────────────────────────────
// White keys: A S D F G H J K L ; ' (11 white keys per octave pair + final C = 15)
// Black keys: W E   T Y U   O P   (mapped to the sharps/flats)
const WHITE_KEY_MAP: Record<string, number> = {
  'a': 0, 's': 1, 'd': 2, 'f': 3, 'g': 4, 'h': 5, 'j': 6,
  'k': 7, 'l': 8, ';': 9, "'": 10, '\\': 11, 'z': 12, 'x': 13, 'c': 14,
}

const BLACK_KEY_MAP: Record<string, number> = {
  'w': 0, 'e': 1, 't': 2, 'y': 3, 'u': 4, 'o': 5, 'p': 6, '[': 7, ']': 8, '=': 9,
}

export default function App() {
  const [octave, setOctave] = useState(3)
  const [sustain, setSustain] = useState(false)
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set())
  const activeRef = useRef(activeKeys)
  activeRef.current = activeKeys

  const keys = buildKeys(octave)
  const whiteKeys = keys.filter(k => !k.isBlack)
  const blackKeys = keys.filter(k => k.isBlack)

  const press = useCallback((key: KeyDef) => {
    playNote(key.freq, sustain)
    setActiveKeys(prev => new Set(prev).add(key.name))
    setTimeout(() => {
      setActiveKeys(prev => {
        const next = new Set(prev)
        next.delete(key.name)
        return next
      })
    }, sustain ? 600 : 200)
  }, [sustain])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey) return
      const k = e.key.toLowerCase()

      // White key?
      const wi = WHITE_KEY_MAP[k]
      if (wi !== undefined && wi < whiteKeys.length) {
        e.preventDefault()
        press(whiteKeys[wi])
        return
      }

      // Black key?
      const bi = BLACK_KEY_MAP[k]
      if (bi !== undefined && bi < blackKeys.length) {
        e.preventDefault()
        press(blackKeys[bi])
        return
      }
    }

    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [press, whiteKeys, blackKeys])

  // Black key positioning: map each black key to its position relative to white keys
  const blackKeyPositions = blackKeys.map(bk => {
    // Find the white key index just before this black key
    const whiteIndex = whiteKeys.findIndex(wk =>
      wk.octave === bk.octave && wk.note === bk.note - 1
    )
    return { key: bk, whiteIndex }
  })

  const whiteW = 100 / whiteKeys.length

  return (
    <Shell app={fas} appName="Piano">
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-6">
        {/* Controls */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => setOctave(o => Math.max(1, o - 1))}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold"
            style={{ background: 'var(--glass)', color: 'var(--ink)', border: '1px solid var(--line)' }}
          >
            Octave -
          </button>
          <span className="text-sm font-medium" style={{ color: 'var(--muted)' }}>
            C{octave} — C{octave + 2}
          </span>
          <button
            onClick={() => setOctave(o => Math.min(7, o + 1))}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold"
            style={{ background: 'var(--glass)', color: 'var(--ink)', border: '1px solid var(--line)' }}
          >
            Octave +
          </button>
          <button
            onClick={() => setSustain(s => !s)}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold"
            style={{
              background: sustain ? 'var(--accent)' : 'var(--glass)',
              color: sustain ? '#fff' : 'var(--ink)',
              border: `1px solid ${sustain ? 'var(--accent)' : 'var(--line)'}`,
            }}
          >
            Sustain {sustain ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* Piano */}
        <div
          className="relative select-none"
          style={{ width: '100%', maxWidth: 900, height: 220 }}
        >
          {/* White keys */}
          <div className="absolute inset-0 flex">
            {whiteKeys.map((k, i) => (
              <button
                key={k.name}
                onPointerDown={() => press(k)}
                className="relative flex flex-col items-center justify-end pb-2 transition-colors"
                style={{
                  width: `${whiteW}%`,
                  height: '100%',
                  background: activeKeys.has(k.name)
                    ? 'linear-gradient(to bottom, #e0e0e0, #c8c8c8)'
                    : 'linear-gradient(to bottom, #ffffff, #f0f0f0)',
                  border: '1px solid #bbb',
                  borderRadius: '0 0 6px 6px',
                  marginRight: i < whiteKeys.length - 1 ? '-1px' : 0,
                  boxShadow: activeKeys.has(k.name)
                    ? 'inset 0 2px 4px rgba(0,0,0,0.15)'
                    : '0 4px 8px rgba(0,0,0,0.15), inset 0 -2px 3px rgba(0,0,0,0.05)',
                  zIndex: 1,
                }}
              >
                <span style={{ fontSize: 10, color: '#888', fontWeight: 500 }}>
                  {k.name}
                </span>
              </button>
            ))}
          </div>

          {/* Black keys */}
          {blackKeyPositions.map(({ key: k, whiteIndex }) => {
            if (whiteIndex < 0) return null
            const left = (whiteIndex + 0.55) * whiteW
            return (
              <button
                key={k.name}
                onPointerDown={(e) => { e.stopPropagation(); press(k) }}
                className="absolute top-0 transition-colors"
                style={{
                  left: `${left}%`,
                  width: `${whiteW * 0.65}%`,
                  height: '60%',
                  background: activeKeys.has(k.name)
                    ? 'linear-gradient(to bottom, #444, #333)'
                    : 'linear-gradient(to bottom, #333, #111)',
                  borderRadius: '0 0 4px 4px',
                  border: '1px solid #000',
                  boxShadow: activeKeys.has(k.name)
                    ? 'inset 0 2px 3px rgba(0,0,0,0.4)'
                    : '0 3px 6px rgba(0,0,0,0.4), inset 0 -1px 2px rgba(255,255,255,0.05)',
                  zIndex: 2,
                }}
              >
                <span style={{ fontSize: 8, color: '#999', position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)', fontWeight: 500 }}>
                  {k.name}
                </span>
              </button>
            )
          })}
        </div>

        {/* Keyboard hint */}
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          Keyboard: A S D F G H J K L ; ' \ Z X C for white keys | W E T Y U O P [ ] = for black keys
        </p>
      </div>
    </Shell>
  )
}
