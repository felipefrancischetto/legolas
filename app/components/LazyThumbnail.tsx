'use client';

import { memo, useEffect, useRef, useState } from 'react';

interface LazyThumbnailProps {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  onError?: () => void;
  onVisible?: () => void;
  placeholderClassName?: string;
}

const LazyThumbnail = memo(function LazyThumbnail({
  src,
  alt,
  className,
  style,
  onError,
  onVisible,
  placeholderClassName = 'bg-zinc-800',
}: LazyThumbnailProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true);
      onVisible?.();
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoad(true);
          onVisible?.();
          observer.disconnect();
        }
      },
      { rootMargin: '400px 0px', threshold: 0 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [onVisible]);

  return (
    <div ref={containerRef} className={`w-full h-full ${className ?? ''}`} style={style}>
      {shouldLoad ? (
        <img
          src={src}
          alt={alt}
          className="object-cover w-full h-full"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          loading="lazy"
          decoding="async"
          onError={onError}
        />
      ) : (
        <div className={`w-full h-full ${placeholderClassName}`} aria-hidden />
      )}
    </div>
  );
});

LazyThumbnail.displayName = 'LazyThumbnail';

export default LazyThumbnail;
