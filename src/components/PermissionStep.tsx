import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { MonitorCheck, MonitorUp } from "lucide-react";
import { Button } from "@/components/ui/button";

// Onboarding step shown when Screen Recording access is missing. Polls the
// grant every second (System Settings toggles don't push events) and flips to
// a relaunch prompt once granted — macOS applies the TCC grant to capture
// APIs only after the app restarts.
export function PermissionStep() {
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const ok = await invoke<boolean>("screen_permission_granted");
        if (active) setGranted(ok);
      } catch {
        // backend not ready — keep polling
      }
      if (active) timer = setTimeout(poll, 1000);
    };
    poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  if (granted) {
    return (
      <div className="flex w-full max-w-[340px] flex-col items-center text-center">
        <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary/12 text-primary">
          <MonitorCheck className="size-7" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">Access granted</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          One last thing — macOS applies the permission after a quick relaunch.
        </p>
        <Button
          className="mt-6 w-full"
          onClick={() => invoke("relaunch_app").catch(console.error)}
        >
          Relaunch Beaver
        </Button>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-[340px] flex-col items-center text-center">
      <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary/12 text-primary">
        <MonitorUp className="size-7" />
      </div>
      <h2 className="text-lg font-semibold tracking-tight">Allow screen access</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Beaver reads only the region you draw a box around, and never sends it
        anywhere — extraction runs entirely on this Mac.
      </p>
      <Button
        className="mt-6 w-full"
        onClick={() => invoke("request_screen_permission").catch(console.error)}
      >
        Grant access
      </Button>
      <Button
        variant="ghost"
        className="mt-2 w-full text-muted-foreground"
        onClick={() => invoke("open_screen_recording_settings").catch(console.error)}
      >
        Open System Settings
      </Button>
    </div>
  );
}
