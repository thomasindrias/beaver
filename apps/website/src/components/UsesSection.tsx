import { Mascot } from "./Mascot";

const USES = [
  {
    icon: "📊",
    title: "Tables into spreadsheets",
    body: "Dashboards, reports, bank statements. Rows and columns land intact in Excel, Sheets, or Markdown.",
  },
  {
    icon: "💻",
    title: "Code from anywhere",
    body: "Tutorials, screen shares, Slack screenshots. Indentation and language survive the trip.",
  },
  {
    icon: "🤖",
    title: "Clean input for your AI",
    body: "Screenshot to exact Markdown, straight into Claude, Obsidian, or Notion. A tenth of the tokens of an image.",
  },
  {
    icon: "🧾",
    title: "The sensitive stuff",
    body: "Invoices, contracts, patient notes. Extract the data without it leaving the room.",
  },
];

export function UsesSection() {
  return (
    <section className="mx-auto max-w-[1040px] px-6 pt-[84px] pb-[60px]">
      <div className="mb-11 text-center">
        <Mascot
          mood="happy"
          alt="Happy beaver"
          className="mb-2 inline-block w-[90px]"
        />
        <h2 className="font-display text-[clamp(30px,4vw,46px)] leading-[1.05] font-extrabold">
          What people grab with it
        </h2>
        <p className="mx-auto mt-2.5 max-w-[520px] text-[16.5px] text-muted">
          If it's on your screen, it's yours now.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4.5 max-md:grid-cols-1">
        {USES.map((use) => (
          <article
            key={use.title}
            data-testid="use-case"
            className="card-sticker flex items-start gap-4 p-5.5"
          >
            <span aria-hidden className="flex-none text-[26px]">
              {use.icon}
            </span>
            <div>
              <h3 className="mb-1 text-[17px] font-extrabold">{use.title}</h3>
              <p className="text-[14.5px] text-bark-soft">{use.body}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
