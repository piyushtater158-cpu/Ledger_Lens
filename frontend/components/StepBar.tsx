import { C } from '@/lib/colors';
import type { Screen } from '@/lib/types';

const STEPS = ['Upload', 'Map columns', 'Extract'];

const SCREEN_INDEX: Record<Screen, number> = {
  upload: 0,
  gmail: 0,
  mapping: 1,
  dashboard: 2,
};

export default function StepBar({ screen }: { screen: Screen }) {
  const current = SCREEN_INDEX[screen];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: done ? C.green : active ? C.blue : C.lineSoft,
                  border: `2px solid ${done ? C.green : active ? C.blue : C.line}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'all .2s',
                }}
              >
                {done ? (
                  <span style={{ color: '#fff', fontSize: 11, fontWeight: 700, lineHeight: 1 }}>✓</span>
                ) : (
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: active ? '#fff' : C.faint,
                    }}
                  />
                )}
              </div>
              <span
                style={{
                  font: `${active ? 600 : 500} 13px "IBM Plex Sans"`,
                  color: done ? C.greenInk : active ? C.blueDeep : C.faint,
                  transition: 'color .2s',
                }}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                style={{
                  width: 32,
                  height: 2,
                  background: i < current ? C.green : C.lineSoft,
                  margin: '0 10px',
                  borderRadius: 2,
                  transition: 'background .2s',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
