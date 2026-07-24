#!/usr/bin/env python3
"""Compose un recorte fotográfico real sobre el fondo de producto de NOX.

El script no redibuja ni modifica etiquetas: elimina únicamente el fondo de
la fotografía fuente, conserva el componente principal y añade sombra/escala.
"""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


PRODUCTS = {
    "beer-balboa.webp": ("balboa.png", None, 0.68),
    "beer-atlas-golden.webp": ("atlas-golden.png", None, 0.68),
    "beer-panama-lager.webp": ("panama-retail-page.png", (300, 300, 1100, 1100), 0.69),
    "beer-corona-extra.webp": ("corona-page.png", (100, 100, 1300, 1300), 0.74),
    "beer-heineken.webp": ("heineken-page.png", (551, 551, 849, 849), 0.74),
    "beer-modelo-especial.webp": ("modelo-retail-page.png", (300, 300, 1100, 1100), 0.69),
}


def edge_background_mask(image: Image.Image, tolerance: int = 42) -> Image.Image:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    pixels = rgba.load()
    corners = [
        pixels[0, 0][:3],
        pixels[width - 1, 0][:3],
        pixels[0, height - 1][:3],
        pixels[width - 1, height - 1][:3],
    ]
    background = tuple(sum(color[channel] for color in corners) // 4 for channel in range(3))

    def is_background(x: int, y: int) -> bool:
        red, green, blue, alpha = pixels[x, y]
        if alpha < 16:
            return True
        distance = ((red - background[0]) ** 2 + (green - background[1]) ** 2 + (blue - background[2]) ** 2) ** 0.5
        return distance <= tolerance

    visited = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()
    for x in range(width):
        queue.append((x, 0))
        queue.append((x, height - 1))
    for y in range(height):
        queue.append((0, y))
        queue.append((width - 1, y))

    while queue:
        x, y = queue.popleft()
        index = y * width + x
        if visited[index] or not is_background(x, y):
            continue
        visited[index] = 1
        if x:
            queue.append((x - 1, y))
        if x + 1 < width:
            queue.append((x + 1, y))
        if y:
            queue.append((x, y - 1))
        if y + 1 < height:
            queue.append((x, y + 1))

    mask = Image.new("L", (width, height), 255)
    mask_pixels = mask.load()
    for y in range(height):
        row = y * width
        for x in range(width):
            if visited[row + x]:
                mask_pixels[x, y] = 0
    return mask


def keep_largest_component(mask: Image.Image) -> Image.Image:
    binary = mask.point(lambda value: 255 if value > 48 else 0)
    width, height = binary.size
    pixels = binary.load()
    visited = bytearray(width * height)
    largest: list[tuple[int, int]] = []

    for y in range(height):
        for x in range(width):
            index = y * width + x
            if visited[index] or pixels[x, y] == 0:
                continue
            component: list[tuple[int, int]] = []
            queue = deque([(x, y)])
            visited[index] = 1
            while queue:
                current_x, current_y = queue.popleft()
                component.append((current_x, current_y))
                for next_x, next_y in (
                    (current_x - 1, current_y),
                    (current_x + 1, current_y),
                    (current_x, current_y - 1),
                    (current_x, current_y + 1),
                ):
                    if not (0 <= next_x < width and 0 <= next_y < height):
                        continue
                    next_index = next_y * width + next_x
                    if visited[next_index] or pixels[next_x, next_y] == 0:
                        continue
                    visited[next_index] = 1
                    queue.append((next_x, next_y))
            if len(component) > len(largest):
                largest = component

    result = Image.new("L", mask.size, 0)
    result_pixels = result.load()
    for x, y in largest:
        result_pixels[x, y] = mask.getpixel((x, y))
    return result.filter(ImageFilter.GaussianBlur(0.65))


def compose(source: Path, background: Image.Image, output: Path, crop, height_ratio: float) -> None:
    image = Image.open(source).convert("RGBA")
    if crop:
        image = image.crop(crop)
    mask = keep_largest_component(edge_background_mask(image))
    image.putalpha(mask)
    bbox = mask.getbbox()
    if not bbox:
        raise RuntimeError(f"No se detectó producto en {source}")
    image = image.crop(bbox)

    target_height = round(background.height * height_ratio)
    scale = target_height / image.height
    target_width = round(image.width * scale)
    if target_width > background.width * 0.66:
        scale = (background.width * 0.66) / image.width
        target_width = round(image.width * scale)
        target_height = round(image.height * scale)
    image = image.resize((target_width, target_height), Image.Resampling.LANCZOS)

    canvas = background.copy().convert("RGBA")
    x = (canvas.width - target_width) // 2
    y = round(canvas.height * 0.86) - target_height

    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(shadow)
    shadow_width = max(80, round(target_width * 0.78))
    draw.ellipse(
        (
            canvas.width // 2 - shadow_width // 2,
            y + target_height - 18,
            canvas.width // 2 + shadow_width // 2,
            y + target_height + 24,
        ),
        fill=(0, 0, 0, 145),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(17))
    canvas.alpha_composite(shadow)
    canvas.alpha_composite(image, (x, y))
    canvas.convert("RGB").save(output, "WEBP", quality=88, method=6)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--background", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    background = Image.open(args.background).convert("RGB").resize((768, 768), Image.Resampling.LANCZOS)
    for output_name, (source_name, crop, height_ratio) in PRODUCTS.items():
        compose(args.source_dir / source_name, background, args.output_dir / output_name, crop, height_ratio)
        print(args.output_dir / output_name)


if __name__ == "__main__":
    main()
