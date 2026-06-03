export type View = "capture" | "onboarding" | "popover";

// Picks what a window renders from its route and Tauri window label. Keeping
// this independent of any "setup complete" flag is deliberate: the onboarding
// and popover windows must never swap content based on shared async state that
// can flip mid-load on a warm-cache first run.
export function selectView(route: string, windowLabel: string): View {
  if (route === "/capture") return "capture";
  return windowLabel === "onboarding" ? "onboarding" : "popover";
}
