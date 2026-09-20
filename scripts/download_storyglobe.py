#!/usr/bin/env python3
"""Generate and download a StoryGlobe MP4 through GitHub Pages.

Requires:
    pip install playwright
    playwright install chromium

The browser is controlled entirely from Python. No manual page interaction is required.
"""

from __future__ import annotations

import argparse
from pathlib import Path
from urllib.parse import urlencode

DEFAULT_BASE_URL = "https://skt-pj.github.io/StoryGlobe/"


def build_storyglobe_url(
    *,
    base_url: str = DEFAULT_BASE_URL,
    prev2_name: str | None = None,
    prev2_lat: float | None = None,
    prev2_lon: float | None = None,
    prev_name: str | None = None,
    prev_lat: float | None = None,
    prev_lon: float | None = None,
    name: str | None = None,
    lat: float | None = None,
    lon: float | None = None,
    height: int | None = None,
    duration: float | None = None,
    width: int | None = None,
    output_height: int | None = None,
    next_video: str | None = None,
    filename: str | None = None,
    auto: bool = True,
) -> str:
    params: dict[str, str] = {}

    if prev2_name is not None:
        params["prev2Name"] = prev2_name
    if prev2_lat is not None:
        params["prev2Lat"] = str(prev2_lat)
    if prev2_lon is not None:
        params["prev2Lon"] = str(prev2_lon)
    if prev_name is not None:
        params["prevName"] = prev_name
    if prev_lat is not None:
        params["prevLat"] = str(prev_lat)
    if prev_lon is not None:
        params["prevLon"] = str(prev_lon)
    if name is not None:
        params["name"] = name
    if lat is not None:
        params["lat"] = str(lat)
    if lon is not None:
        params["lon"] = str(lon)
    if height is not None:
        params["height"] = str(height)
    if duration is not None:
        params["duration"] = str(duration)
    if width is not None:
        params["w"] = str(width)
    if output_height is not None:
        params["h"] = str(output_height)
    if next_video:
        params["next"] = next_video
    if filename:
        params["filename"] = filename
    if auto:
        params["auto"] = "1"

    query = urlencode(params)
    if not query:
        return base_url

    separator = "&" if "?" in base_url else "?"
    return f"{base_url}{separator}{query}"


def _launch_browser(playwright, *, channel: str | None, headless: bool):
    attempts = [channel] if channel else ["chrome", None]
    last_error = None

    for candidate in attempts:
        kwargs = {
            "headless": headless,
            "args": [
                "--autoplay-policy=no-user-gesture-required",
                "--disable-background-timer-throttling",
                "--disable-renderer-backgrounding",
            ],
        }
        if candidate:
            kwargs["channel"] = candidate

        try:
            return playwright.chromium.launch(**kwargs)
        except Exception as error:
            last_error = error

    raise RuntimeError(
        "Chrome/Chromiumを起動できませんでした。"
        " pip install playwright と playwright install chromium を確認してください。"
    ) from last_error


def download_storyglobe(
    output_path: str | Path,
    *,
    base_url: str = DEFAULT_BASE_URL,
    prev2_name: str | None = None,
    prev2_lat: float | None = None,
    prev2_lon: float | None = None,
    prev_name: str | None = None,
    prev_lat: float | None = None,
    prev_lon: float | None = None,
    name: str | None = None,
    lat: float | None = None,
    lon: float | None = None,
    height: int | None = None,
    duration: float | None = None,
    width: int | None = None,
    output_height: int | None = None,
    next_video: str | None = None,
    filename: str | None = None,
    timeout_seconds: int = 600,
    channel: str | None = None,
    headless: bool = True,
) -> Path:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as error:
        raise RuntimeError(
            "Playwrightが必要です: pip install playwright && playwright install chromium"
        ) from error

    destination = Path(output_path).expanduser().resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)

    url = build_storyglobe_url(
        base_url=base_url,
        prev2_name=prev2_name,
        prev2_lat=prev2_lat,
        prev2_lon=prev2_lon,
        prev_name=prev_name,
        prev_lat=prev_lat,
        prev_lon=prev_lon,
        name=name,
        lat=lat,
        lon=lon,
        height=height,
        duration=duration,
        width=width,
        output_height=output_height,
        next_video=next_video,
        filename=filename or destination.stem,
        auto=True,
    )

    with sync_playwright() as playwright:
        browser = _launch_browser(
            playwright,
            channel=channel,
            headless=headless,
        )
        context = browser.new_context(
            accept_downloads=True,
            viewport={"width": 1280, "height": 720},
        )
        page = context.new_page()
        timeout_ms = timeout_seconds * 1000

        try:
            with page.expect_download(timeout=timeout_ms) as download_info:
                page.goto(
                    url,
                    wait_until="domcontentloaded",
                    timeout=min(timeout_ms, 60000),
                )

            download = download_info.value
            download.save_as(str(destination))
        finally:
            context.close()
            browser.close()

    return destination


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="StoryGlobeをURLパラメータで起動しMP4を自動ダウンロードします。"
    )
    parser.add_argument("output", help="保存先MP4パス")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--prev2-name")
    parser.add_argument("--prev2-lat", type=float)
    parser.add_argument("--prev2-lon", type=float)
    parser.add_argument("--prev-name")
    parser.add_argument("--prev-lat", type=float)
    parser.add_argument("--prev-lon", type=float)
    parser.add_argument("--name")
    parser.add_argument("--lat", type=float)
    parser.add_argument("--lon", type=float)
    parser.add_argument("--height", type=int)
    parser.add_argument("--duration", type=float)
    parser.add_argument("--width", type=int)
    parser.add_argument("--output-height", type=int)
    parser.add_argument("--next-video")
    parser.add_argument("--filename")
    parser.add_argument("--timeout", type=int, default=600)
    parser.add_argument("--channel", help="例: chrome, msedge")
    parser.add_argument("--headed", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    path = download_storyglobe(
        args.output,
        base_url=args.base_url,
        prev2_name=args.prev2_name,
        prev2_lat=args.prev2_lat,
        prev2_lon=args.prev2_lon,
        prev_name=args.prev_name,
        prev_lat=args.prev_lat,
        prev_lon=args.prev_lon,
        name=args.name,
        lat=args.lat,
        lon=args.lon,
        height=args.height,
        duration=args.duration,
        width=args.width,
        output_height=args.output_height,
        next_video=args.next_video,
        filename=args.filename,
        timeout_seconds=args.timeout,
        channel=args.channel,
        headless=not args.headed,
    )
    print(path)


if __name__ == "__main__":
    main()
