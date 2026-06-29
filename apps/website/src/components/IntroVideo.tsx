import { useEffect, useRef } from "react";
import { brandAssets } from "../constants";

interface IntroVideoProps {
  isSettled: boolean;
  onSettle: () => void;
}

export function IntroVideo({ isSettled, onSettle }: IntroVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // onSettle must be a referentially stable callback (e.g. wrapped in
  // useCallback by the caller) — this effect re-fires play() whenever it
  // changes, which would restart playback after the video has already
  // ended or been skipped.
  useEffect(() => {
    videoRef.current?.play().catch(onSettle);
  }, [onSettle]);

  useEffect(() => {
    if (isSettled) {
      videoRef.current?.pause();
    }
  }, [isSettled]);

  return (
    <div
      data-testid="intro-video"
      aria-hidden="true"
      onClick={onSettle}
      className={`fixed inset-0 z-0 flex cursor-pointer items-center justify-center bg-[var(--color-page-background)] transition-opacity duration-500 ${
        isSettled ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <video
        ref={videoRef}
        className="h-full w-full object-cover"
        src={brandAssets.wave}
        muted
        playsInline
        onEnded={onSettle}
      />
    </div>
  );
}
