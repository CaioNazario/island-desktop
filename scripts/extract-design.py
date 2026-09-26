#!/usr/bin/env python3
"""Extrai o protótipo empacotado (Claude Design) para arquivos legíveis em design/."""

import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "Desktop Island.html"
OUT = ROOT / "design"


def script_block(doc: str, kind: str) -> str:
    m = re.search(rf'<script type="__bundler/{kind}"[^>]*>(.*?)</script>', doc, re.S)
    if not m:
        sys.exit(f"bloco __bundler/{kind} não encontrado em {SRC}")
    return m.group(1)


def main() -> None:
    doc = SRC.read_text(encoding="utf-8")
    template = json.loads(script_block(doc, "template"))

    tokens = re.search(r"<style>(/\* Nocturne.*?)</style>", template, re.S)
    page = re.search(r"</helmet>(.*?)<script type=\"text/x-dc\"", template, re.S)
    logic = re.search(r'<script type="text/x-dc"[^>]*data-props="([^"]*)"[^>]*>(.*?)</script>', template, re.S)
    if not (tokens and page and logic):
        sys.exit("estrutura do template mudou; ajuste scripts/extract-design.py")

    OUT.mkdir(exist_ok=True)
    (OUT / "tokens.css").write_text(tokens.group(1).strip() + "\n", encoding="utf-8")
    (OUT / "markup.html").write_text(page.group(1).strip() + "\n", encoding="utf-8")
    (OUT / "logic.js").write_text(logic.group(2).strip() + "\n", encoding="utf-8")
    props = json.loads(html.unescape(logic.group(1)))
    (OUT / "props.json").write_text(json.dumps(props, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"design/ atualizado a partir de {SRC.name}")


if __name__ == "__main__":
    main()
