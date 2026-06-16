import { C } from '@/lib/colors';

export default function Logo({ size = 36 }: { size?: number }) {
  const inner = size * 0.5;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.22,
        background: 'linear-gradient(150deg, #3b78f0 0%, #2356c8 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: inner,
          height: inner,
          borderRadius: inner * 0.2,
          background: 'rgba(255,255,255,0.28)',
          border: '1.5px solid rgba(255,255,255,0.7)',
        }}
      />
    </div>
  );
}
