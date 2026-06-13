import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

interface Props {
  src: string;
  /** "scrub" maps currentTime to scroll. "loop" autoplays muted loop. */
  mode?: "scrub" | "loop";
  className?: string;
  /** scroll distance multiplier (scrub only) */
  scrubLength?: number;
  overlayClassName?: string;
}

export default function ScrollVideo({
  src,
  mode = "scrub",
  className = "",
  scrubLength = 1.5,
  overlayClassName = "",
}: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.play().catch(e => console.warn("Autoplay blocked:", e));
    }
  }, [src]);

  useEffect(() => {
    if (mode !== "scrub") return;
    const wrap = wrapRef.current;
    if (!wrap) return;

    const trigger = ScrollTrigger.create({
      trigger: wrap,
      start: "top top",
      end: () => `+=${window.innerHeight * scrubLength}`,
      pin: true,
      // Removed scrub and onUpdate so video plays normally while container is pinned
    });
    ScrollTrigger.refresh();

    return () => {
      trigger.kill();
    };
  }, [mode, scrubLength]);

  return (
    <div ref={wrapRef} className={`relative overflow-hidden ${className}`}>
      <video
        ref={videoRef}
        src={src}
        muted
        playsInline
        preload="auto"
        autoPlay={true}
        loop={true}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className={`absolute inset-0 pointer-events-none ${overlayClassName}`} />
    </div>
  );
}