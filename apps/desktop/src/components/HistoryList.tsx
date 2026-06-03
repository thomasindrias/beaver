import { useCallback } from "react";
import type { Capture } from "../types";
import { CaptureEntry } from "./CaptureEntry";
import { Logo } from "./Logo";
import { Kbd } from "./Kbd";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Props { captures: Capture[] }

export function HistoryList({ captures }: Props) {
  const handleCopy = useCallback((content: string) => {
    navigator.clipboard.writeText(content);
  }, []);

  if (captures.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <Logo size={44} className="opacity-40" />
        <p className="mt-4 text-sm font-medium text-foreground">No captures yet</p>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          Press <Kbd>⌘</Kbd> <Kbd>⇧</Kbd> <Kbd>D</Kbd> and draw around anything on your
          screen to pull the data out.
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-1.5 p-2">
        {captures.map((c) => (
          <CaptureEntry key={c.id} capture={c} onCopy={handleCopy} />
        ))}
      </div>
    </ScrollArea>
  );
}
