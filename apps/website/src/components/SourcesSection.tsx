const SOURCES = [
  {
    id: "src1",
    text: "Anthropic vision docs; see also Roboflow, ",
    linkText: '"What does it cost to process an image with a vision model?"',
    href: "https://blog.roboflow.com/image-token-cost-vlm/",
  },
  {
    id: "src2",
    text: "Visheratin, ",
    linkText: '"Breaking the resolution curse of vision-language models"',
    href: "https://huggingface.co/blog/visheratin/vlm-resolution-curse",
    suffix: ", Hugging Face.",
  },
  {
    id: "src3",
    text: "",
    linkText:
      '"Are Large Vision Language Models up to the Challenge of Chart Comprehension and Reasoning?"',
    href: "https://arxiv.org/pdf/2406.00257",
    suffix: ", arXiv:2406.00257.",
  },
];

export function SourcesSection() {
  return (
    <div
      data-testid="sources"
      className="mx-auto max-w-[1040px] px-6 pb-2.5"
    >
      <h3 className="mb-3 text-[13px] font-extrabold tracking-wider text-muted uppercase">
        Sources
      </h3>
      <ol className="list-decimal pl-5 text-[13px] text-muted">
        {SOURCES.map((source) => (
          <li key={source.id} id={source.id} className="mb-1.5">
            {source.text}
            <a href={source.href} className="underline underline-offset-2">
              {source.linkText}
            </a>
            {source.suffix}
          </li>
        ))}
      </ol>
    </div>
  );
}
