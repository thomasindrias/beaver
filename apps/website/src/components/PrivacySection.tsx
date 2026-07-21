import { Mascot } from "./Mascot";

export function PrivacySection() {
  return (
    <section className="bg-bark text-[#f3e9db]">
      <div className="mx-auto grid max-w-[1040px] items-center gap-11 px-6 pt-[76px] pb-[76px] max-md:grid-cols-1 md:grid-cols-[0.8fr_1.2fr]">
        <div className="text-center">
          <Mascot
            mood="sleepy"
            alt="Sleepy beaver"
            className="inline-block w-[min(240px,70%)]"
          />
        </div>
        <div>
          <h2 className="mb-3.5 font-display text-[clamp(30px,4vw,46px)] leading-[1.05] font-extrabold text-cream">
            Your data sleeps at home.
          </h2>
          <p className="mb-3.5 max-w-[56ch] text-base text-[#cbb9a4]">
            Beaver's vision model runs on your Mac. A capture is processed
            locally and lands on your clipboard;{" "}
            <strong className="text-cream">
              there is no server to send it to.
            </strong>{" "}
            Privacy here isn't a promise in a policy, it's how the thing is
            built. That matters for invoices, contracts, patient notes, and
            anything under NDA.
          </p>
          <ul className="moon-list mt-4.5 list-none space-y-3 p-0 text-[15px] text-[#e6d9c7]">
            <li>On-device model: MLX on Apple Silicon, llama.cpp on Intel</li>
            <li>Open source (MIT), build it from source if you like</li>
            <li>History is a local SQLite file, yours to keep or delete</li>
            <li>
              Only network call: an optional update check.{" "}
              <code className="font-mono text-[13px] text-sun">
                BEAVER_DISABLE_UPDATE_CHECK=1
              </code>{" "}
              kills it.
            </li>
            <li>
              Works offline. Works on a plane. And you can verify all of this:
              read the source, or watch Little Snitch do nothing.
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
