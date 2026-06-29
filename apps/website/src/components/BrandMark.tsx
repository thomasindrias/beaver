import { brandAssets } from "../constants";

interface BrandMarkProps {
  size?: number;
  className?: string;
  alt?: string;
  decorative?: boolean;
}

export function BrandMark({
  size = 40,
  className,
  alt = "Beaver",
  decorative = false,
}: BrandMarkProps) {
  return (
    <img
      src={brandAssets.head}
      alt={decorative ? "" : alt}
      aria-hidden={decorative || undefined}
      width={size}
      height={size}
      draggable={false}
      className={["select-none", className].filter(Boolean).join(" ")}
    />
  );
}
