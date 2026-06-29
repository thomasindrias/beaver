#!/usr/bin/env python3
"""Build a square native icon source from Beaver's canonical UI mark."""
import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public" / "beaver-head.webp"

SIZE = 1024


def write_icon(out_path: str, size: int) -> None:
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "sips",
            "-s",
            "format",
            "png",
            "-z",
            str(size),
            str(size),
            str(SRC),
            "--out",
            str(out),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
    )
    print(f"wrote {out_path} ({size}x{size}) from {SRC.relative_to(ROOT)}")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("out_path", nargs="?", default="/tmp/beaver-icon-source.png")
    parser.add_argument("--size", type=int, default=SIZE)
    return parser.parse_args(argv)


def main(argv: list[str]) -> None:
    args = parse_args(argv)
    write_icon(args.out_path, args.size)


if __name__ == "__main__":
    main(sys.argv[1:])
