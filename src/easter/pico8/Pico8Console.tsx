import { useRef, useEffect, useCallback } from 'react';
import { PicoAPI } from './api';
import { InwazjaCart } from './cart';

interface Props {
  onClose: () => void;
}

export function Pico8Console({ onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const apiRef = useRef<PicoAPI | null>(null);
  const cartRef = useRef<InwazjaCart | null>(null);
  const rafRef = useRef(0);

  const loopFn = useCallback(() => {
    const api = apiRef.current;
    const cart = cartRef.current;
    if (!api || !cart) return;
    cart.update();
    cart.draw();
    rafRef.current = requestAnimationFrame(loopFn);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const api = new PicoAPI(canvas);
    apiRef.current = api;
    const cart = new InwazjaCart(api);
    cartRef.current = cart;

    const handleKeyDown = (e: KeyboardEvent) => {
      api.keyDown(e.key);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      api.keyUp(e.key);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    api.cls(0);
    cart.draw();
    rafRef.current = requestAnimationFrame(loopFn);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      apiRef.current = null;
      cartRef.current = null;
    };
  }, [loopFn]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.85)',
      fontFamily: 'monospace',
    }}>
      <div style={{
        background: '#1D2B53',
        padding: '24px',
        borderRadius: '12px',
        border: '2px solid #7E2553',
        textAlign: 'center',
      }}>
        <div style={{
          color: '#FFEC27', fontSize: '12px', marginBottom: '8px',
          letterSpacing: '2px', textTransform: 'uppercase',
        }}>
          PICO-8 Fantasy Console
        </div>
        <canvas
          ref={canvasRef}
          style={{
            width: '512px', height: '512px',
            imageRendering: 'pixelated',
            border: '2px solid #5F574F',
            borderRadius: '4px',
            display: 'block',
            maxWidth: '90vw', maxHeight: '70vh',
          }}
        />
        <div style={{
          color: '#C2C3C7', fontSize: '11px', marginTop: '8px',
        }}>
          Arrows: move | Z: shoot | ESC: exit
        </div>
        <button
          onClick={() => {
            const api = apiRef.current;
            if (api) api.initAudio();
          }}
          style={{
            marginTop: '8px', padding: '4px 16px',
            background: '#7E2553', color: '#FFF1E8',
            border: 'none', borderRadius: '4px',
            cursor: 'pointer', fontFamily: 'monospace', fontSize: '12px',
          }}
        >
          Init Audio
        </button>
        <button
          onClick={onClose}
          style={{
            marginTop: '8px', marginLeft: '8px', padding: '4px 16px',
            background: '#AB5236', color: '#FFF1E8',
            border: 'none', borderRadius: '4px',
            cursor: 'pointer', fontFamily: 'monospace', fontSize: '12px',
          }}
        >
          Exit
        </button>
      </div>
      <style>{`
        @media (max-width: 768px) {
          canvas { width: 90vw !important; height: 90vw !important; }
        }
      `}</style>
    </div>
  );
}

export default Pico8Console;
