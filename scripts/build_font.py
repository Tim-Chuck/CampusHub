"""Build the local UI font: python build_font.py /path/to/NotoSansSC-VF.ttf.

Build-only dependencies: fonttools[woff]. The generated subset remains under OFL.
"""
import argparse
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parents[1]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    args = parser.parse_args()
    font = TTFont(args.source)
    family = font["name"].getDebugName(1)
    if "Noto Sans SC" not in family:
        raise ValueError("Use the Noto Sans SC variable font covered by the bundled OFL.")
    characters = set(chr(i) for i in range(0x20, 0x100))
    characters.update(chr(i) for i in range(0x2000, 0x2070))
    characters.update(chr(i) for i in range(0x3000, 0x3040))
    characters.update(chr(i) for i in range(0xFF00, 0xFFF0))
    for high in range(0xB0, 0xD8):
        for low in range(0xA1, 0xFF):
            try:
                characters.update(bytes([high, low]).decode("gb2312"))
            except UnicodeDecodeError:
                pass
    for pattern in ("*.js", "*.html"):
        for source in ROOT.glob(pattern):
            characters.update(source.read_text(encoding="utf-8"))
    for weight, name in [(400, "regular"), (600, "semibold")]:
        instance = instantiateVariableFont(TTFont(args.source), {"wght": weight}, inplace=True)
        options = subset.Options()
        options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14, 16, 17]
        options.name_languages = [0x409]
        options.layout_features = ["*"]
        sub = subset.Subsetter(options=options)
        sub.populate(unicodes={ord(c) for c in characters})
        sub.subset(instance)
        instance.flavor = "woff2"
        target = ROOT / f"assets/fonts/campus-sans-{name}.woff2"
        target.parent.mkdir(parents=True, exist_ok=True)
        instance.save(target)
        print(f"Built {target.name}: {target.stat().st_size:,} bytes, {len(instance.getBestCmap()):,} characters", flush=True)

if __name__ == "__main__":
    main()
