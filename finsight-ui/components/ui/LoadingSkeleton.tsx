export function LoadingSkeleton({ rows = 3, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-8 w-full" style={{ opacity: 1 - i * 0.15 }} />
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="glass p-5 space-y-3">
      <div className="skeleton h-4 w-1/3" />
      <div className="skeleton h-8 w-2/3" />
      <div className="skeleton h-3 w-1/2" />
    </div>
  );
}
