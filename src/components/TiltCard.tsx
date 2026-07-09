import { useRef, useState, type ReactNode, type MouseEvent } from 'react';
import { motion } from 'framer-motion';

interface TiltCardProps {
  children: ReactNode;
  className?: string;
  glowColor?: string;
  intensity?: number;
}

export default function TiltCard({ children, className = '', glowColor = '139,92,246', intensity = 10 }: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState({ rx: 0, ry: 0, mx: 50, my: 50 });

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const ry = (px - 0.5) * intensity * 2;
    const rx = (0.5 - py) * intensity * 2;
    setStyle({ rx, ry, mx: px * 100, my: py * 100 });
  };

  const onLeave = () => setStyle({ rx: 0, ry: 0, mx: 50, my: 50 });

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ transformStyle: 'preserve-3d' }}
      animate={{ rotateX: style.rx, rotateY: style.ry }}
      transition={{ type: 'spring', stiffness: 200, damping: 18 }}
      className={`relative overflow-hidden rounded-2xl glass ${className}`}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-300"
        style={{
          background: `radial-gradient(360px circle at ${style.mx}% ${style.my}%, rgba(${glowColor},0.18), transparent 60%)`,
        }}
      />
      {children}
    </motion.div>
  );
}
