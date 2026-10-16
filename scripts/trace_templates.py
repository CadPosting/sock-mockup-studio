"""Trace Peter's flat-colour Keynote template slides into SVG paths.

Usage:
    python scripts/trace_templates.py CREW_PNG ANKLE_PNG OUT_TS [--preview DIR]

CREW_PNG  = "sock mockup examples.001.png" (crew side profile, assembled)
ANKLE_PNG = "ankle sock model.001.png"      (ankle template, assembled, 4 views)

Each zone on the slides is one flat colour (blue body, red cuff/toe, yellow heel),
so every pixel is classified to its nearest template colour, each zone becomes a
mask, and each mask's outline becomes a smooth closed path.

Only the side profiles are traced. The flat front/back/sole tubes are plain
rectangles + ellipses and are drawn as exact geometry in src/templates/flat.ts.

Needs: pillow, numpy, scikit-image (dev-only; not an app dependency).
"""

from __future__ import annotations

import argparse
import logging
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from skimage import measure

log = logging.getLogger("trace")

# Local coordinate box of a profile view slot (see src/render/layout.ts).
PROFILE_W = 265
PROFILE_H = 440
PROFILE_ORIGIN = (470, 290)  # sheet position of the Left slot's box

WHITE, BLUE, RED, YELLOW, BLACK = range(5)
PALETTE = np.array(
    [
        [255, 255, 255],
        [69, 154, 248],  # body (both slides use ~ #4294F7 / #479FF8)
        [213, 58, 43],  # cuff + toe
        [242, 177, 61],  # heel
        [20, 16, 16],  # 1px outlines on some zones
    ],
    dtype=float,
)


@dataclass
class Traced:
    silhouette: list[np.ndarray]  # one or more closed polygons (x, y) in local coords
    zones: dict[str, np.ndarray]


def classify(img: np.ndarray) -> np.ndarray:
    """Label every pixel with its nearest palette colour; outline pixels join their nearest zone."""
    d = ((img[:, :, None, :].astype(float) - PALETTE[None, None]) ** 2).sum(-1)
    labels = d.argmin(-1)
    # Black outline pixels belong to whichever coloured zone is closest to them.
    coloured = (labels != WHITE) & (labels != BLACK)
    _, (iy, ix) = ndimage.distance_transform_edt(~coloured, return_indices=True)
    black = labels == BLACK
    labels[black] = labels[iy[black], ix[black]]
    return labels


def outline(mask: np.ndarray, tolerance: float = 1.2) -> np.ndarray:
    """Longest contour of a mask, simplified, as (x, y) points."""
    # Blur before contouring: the slides' anti-aliasing and 1px black outlines
    # otherwise leave a stair-step wobble along zone edges.
    padded = ndimage.gaussian_filter(np.pad(mask.astype(float), 3), sigma=1.5)
    contours = measure.find_contours(padded, 0.5)
    c = max(contours, key=len) - 3  # undo padding
    c = measure.approximate_polygon(c, tolerance)
    return c[:, ::-1]  # (row, col) -> (x, y)


def components(mask: np.ndarray, min_px: int = 200) -> list[np.ndarray]:
    lab, n = ndimage.label(mask)
    comps = [lab == i for i in range(1, n + 1)]
    return [c for c in comps if c.sum() >= min_px]


def top_y(mask: np.ndarray) -> int:
    return int(np.nonzero(mask.any(axis=1))[0][0])


def trace_profile(labels: np.ndarray, crop: tuple[int, int, int, int]) -> dict[str, np.ndarray]:
    """Return raw zone masks (in crop coordinates) for one side profile."""
    x0, y0, x1, y1 = crop
    lab = labels[y0:y1, x0:x1]
    # Silhouette: every non-white pixel, small gaps between zones closed.
    # Closing seals the thin white seams between zones (they put kinks in the outline at the toe);
    # opening then shaves off 1-2px slivers, like the cuff rectangle's outline sticking out as "horns".
    sil = ndimage.binary_closing(np.pad(lab != WHITE, 6), iterations=4)[6:-6, 6:-6]
    sil = ndimage.binary_fill_holes(sil)
    sil = ndimage.binary_opening(sil, iterations=3)
    reds = sorted(components(lab == RED), key=top_y)
    if len(reds) != 2:
        raise ValueError(f"expected 2 red zones (cuff, toe), found {len(reds)}")
    heel = components(lab == YELLOW)
    if len(heel) != 1:
        raise ValueError(f"expected 1 yellow heel, found {len(heel)}")
    # Grow each zone outward past the sock edge (never into other zones). The renderer clips
    # zones to the silhouette, so the overlap is invisible but stops body colour showing in a
    # gap between a zone and the outline (it did along the top of the crew cuff).
    outside = ~sil
    zones = {"cuff": reds[0], "toe": reds[1], "heel": heel[0]}
    zones = {k: z | (ndimage.binary_dilation(z, iterations=6) & outside) for k, z in zones.items()}
    return {"silhouette": sil, **zones}


def to_local(
    masks: dict[str, np.ndarray], crop: tuple[int, int, int, int], fit_height: float | None
) -> Traced:
    """Convert masks to polygons in the profile slot's local coordinates.

    fit_height=None keeps the slide's scale (ankle slide is already at sheet size);
    otherwise the sock is scaled to that height (crew slide is drawn ~1.7x bigger).
    """
    x0, y0, _, _ = crop
    # The silhouette gets a coarser simplification: closely spaced points at sharp corners
    # make the smoothing spline overshoot into little hooks.
    polys = {
        k: outline(m, tolerance=2.0 if k == "silhouette" else 1.2) + [x0, y0] for k, m in masks.items()
    }  # back to slide coords
    sil = polys["silhouette"]
    minx, miny = sil.min(0)
    maxx, maxy = sil.max(0)
    if fit_height is None:
        ox, oy = PROFILE_ORIGIN
        transform = lambda p: p - [ox, oy]  # noqa: E731
    else:
        s = fit_height / (maxy - miny)
        cx = (minx + maxx) / 2
        # Centre horizontally, bottom-align 8 units above the slot's bottom edge.
        transform = lambda p: (p - [cx, maxy]) * s + [PROFILE_W / 2, PROFILE_H - 8]  # noqa: E731
    out = {k: transform(v) for k, v in polys.items()}
    return Traced(silhouette=[out.pop("silhouette")], zones=out)


def smooth_path(pts: np.ndarray) -> str:
    """Closed Catmull-Rom spline through the points, written as cubic Beziers.

    Keeps Peter's hand-drawn curves smooth at 2x export instead of faceted polygons.
    """
    n = len(pts)
    if n > 1 and np.allclose(pts[0], pts[-1]):
        pts, n = pts[:-1], n - 1
    f = lambda v: f"{v:.1f}".rstrip("0").rstrip(".")  # noqa: E731

    # Tangent at each point. Plain Catmull-Rom overshoots at sharp corners (the cuff's square
    # corners came out as little hooks), so corners turning more than ~55 degrees get no tangent
    # and stay sharp.
    tangents = []
    for i in range(n):
        a, b, c = pts[i - 1], pts[i], pts[(i + 1) % n]
        u, v = b - a, c - b
        cos = np.dot(u, v) / (np.linalg.norm(u) * np.linalg.norm(v) + 1e-9)
        tangents.append(np.zeros(2) if cos < 0.57 else (c - a) / 6)

    def capped(t: np.ndarray, seg: float) -> np.ndarray:
        # A handle longer than a third of its segment makes the curve bulge past the next point.
        norm = np.linalg.norm(t)
        return t if norm <= seg / 3 else t * (seg / 3 / norm)

    parts = [f"M{f(pts[0][0])} {f(pts[0][1])}"]
    for i in range(n):
        p1, p2 = pts[i], pts[(i + 1) % n]
        seg = float(np.linalg.norm(p2 - p1))
        c1 = p1 + capped(tangents[i], seg)
        c2 = p2 - capped(tangents[(i + 1) % n], seg)
        parts.append(
            f"C{f(c1[0])} {f(c1[1])} {f(c2[0])} {f(c2[1])} {f(p2[0])} {f(p2[1])}"
        )
    return "".join(parts) + "Z"


def preview(src: Path, traced: Traced, crop_origin: tuple[float, float], scale_back, out: Path) -> None:
    """Draw traced polygons over the source slide so the fit can be eyeballed."""
    img = Image.open(src).convert("RGB")
    draw = ImageDraw.Draw(img)
    for poly in [*traced.silhouette, *traced.zones.values()]:
        pts = [tuple(scale_back(p)) for p in poly]
        draw.line(pts + [pts[0]], fill=(0, 0, 0), width=1)
    img.save(out)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    ap = argparse.ArgumentParser()
    ap.add_argument("crew_png", type=Path)
    ap.add_argument("ankle_png", type=Path)
    ap.add_argument("out_ts", type=Path)
    ap.add_argument("--preview", type=Path)
    args = ap.parse_args()

    results: dict[str, Traced] = {}

    crew_img = np.asarray(Image.open(args.crew_png).convert("RGB"))
    crew_crop = (150, 40, 700, 768)
    results["crew"] = to_local(trace_profile(classify(crew_img), crew_crop), crew_crop, fit_height=410)

    ankle_img = np.asarray(Image.open(args.ankle_png).convert("RGB"))
    ankle_crop = (480, 290, 740, 740)  # Left view only; Right is drawn as its mirror
    results["ankle"] = to_local(trace_profile(classify(ankle_img), ankle_crop), ankle_crop, fit_height=None)

    lines = [
        "// GENERATED by scripts/trace_templates.py from Peter's Keynote template slides. Do not edit by hand.",
        "// Left-side profiles in the profile slot's local coordinates; Right = mirror.",
        "",
        "export type ProfilePaths = { silhouette: string; zones: Record<'cuff' | 'heel' | 'toe', string> }",
        "",
        f"export const PROFILE_SIZE = {{ width: {PROFILE_W}, height: {PROFILE_H} }}",
        "",
        "export const PROFILES: Record<'crew' | 'ankle', ProfilePaths> = {",
    ]
    for name, t in results.items():
        lines.append(f"  {name}: {{")
        lines.append(f"    silhouette: '{smooth_path(t.silhouette[0])}',")
        lines.append("    zones: {")
        for z in ("cuff", "heel", "toe"):
            lines.append(f"      {z}: '{smooth_path(t.zones[z])}',")
        lines.append("    },")
        lines.append("  },")
    lines.append("}")
    args.out_ts.write_text("\n".join(lines) + "\n")
    log.info("wrote %s", args.out_ts)

    if args.preview:
        args.preview.mkdir(parents=True, exist_ok=True)
        ox, oy = PROFILE_ORIGIN
        preview(args.ankle_png, results["ankle"], (ox, oy), lambda p: p + [ox, oy], args.preview / "ankle.png")
        # Crew preview: draw in slot coordinates on a blank sheet next to a scaled source.
        blank = Image.new("RGB", (PROFILE_W, PROFILE_H), "white")
        blank.save(args.preview / "blank.png")
        preview(args.preview / "blank.png", results["crew"], (0, 0), lambda p: p, args.preview / "crew.png")
        for name, t in results.items():
            log.info("%s: silhouette %d pts, zones %s", name, len(t.silhouette[0]), {k: len(v) for k, v in t.zones.items()})


if __name__ == "__main__":
    main()
