"""Polskie Radio Dzieciom integration."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
import logging
from typing import Any, Optional

import aiohttp

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform, EVENT_HOMEASSISTANT_STARTED
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator
from homeassistant.helpers.aiohttp_client import async_get_clientsession

_LOGGER = logging.getLogger(__name__)

DOMAIN = "prd"
PLATFORMS: list[Platform] = [Platform.SENSOR]
API_URL = "https://apipr.polskieradio.pl/api/schedule?Program=11"

BROWSER_HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Referer": "https://www.polskieradio.pl/18/5575/",
    "Sec-Ch-Ua": '"Chromium";v="126", "Not)A;Brand";v="24", "Google Chrome";v="126"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/126.0.0.0 Safari/537.36"
    ),
    "Origin": "https://www.polskieradio.pl",
}


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    async def _handle_refresh_service(call):
        domain_data = hass.data.get(DOMAIN, {})
        for entry_id, data in domain_data.items():
            coordinator: DataUpdateCoordinator = data.get("coordinator")
            if coordinator:
                await coordinator.async_request_refresh()

    hass.services.async_register(DOMAIN, "refresh", _handle_refresh_service)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    # Use HA shared session
    session = async_get_clientsession(hass)

    async def fetch_schedule() -> dict[str, Any] | None:
        # Fetch today's schedule and shape data
        now = datetime.now(timezone.utc).astimezone()
        today_local = now.date()
        try:
            async with session.get(
                API_URL, headers=BROWSER_HEADERS, timeout=15
            ) as resp:
                if resp.status != 200:
                    _LOGGER.warning("PRD API returned status %s", resp.status)
                    return None
                data = await resp.json(content_type=None)
        except Exception as err:
            _LOGGER.error("Error fetching PRD schedule: %s", err)
            return None

        schedule = data.get("Schedule", [])
        # Normalize entries: parse times to aware datetimes in local tz
        parsed: list[dict[str, Any]] = []
        for item in schedule:
            try:
                start_str = item.get("StartHour")
                stop_str = item.get("StopHour")
                start = datetime.fromisoformat(start_str)
                stop = datetime.fromisoformat(stop_str)
            except Exception:
                continue
            if start.date() != today_local and stop.date() != today_local:
                # Keep also items that cross midnight if either date is today
                pass
            parsed.append(
                {
                    "id": item.get("Id"),
                    "title": item.get("Title"),
                    "description": item.get("Description"),
                    "start": start,
                    "stop": stop,
                    "photo": item.get("Photo"),
                    "leaders": item.get("Leaders"),
                    "category": item.get("Category", {}).get("Name"),
                }
            )

        # Determine current and next programme
        current: Optional[dict[str, Any]] = None
        next_prog: Optional[dict[str, Any]] = None
        for prog in parsed:
            if prog["start"] <= now <= prog["stop"]:
                current = prog
            if prog["start"] > now and (
                next_prog is None or prog["start"] < next_prog["start"]
            ):
                next_prog = prog

        return {
            "now": now.isoformat(),
            "current": _serialize_prog(current, now),
            "next": _serialize_prog(next_prog, now, is_next=True),
            "rest_of_day": [
                _serialize_prog(p, now) for p in parsed if p["start"] >= now
            ],
            "raw": parsed,
        }

    coordinator = DataUpdateCoordinator(
        hass,
        _LOGGER,
        name="prd_schedule",
        update_method=fetch_schedule,
        # Start with shorter interval to recover quickly after boot, then switch to hourly
        update_interval=timedelta(minutes=5),
    )

    await coordinator.async_config_entry_first_refresh()

    @callback
    def _on_coordinator_update():
        # When we have data, slow down to hourly to meet the requirement
        if coordinator.data:
            coordinator.update_interval = timedelta(hours=1)

    # Watch for first success
    coordinator.async_add_listener(_on_coordinator_update)

    # Also refresh once HA fully started (network stack up)
    async def _ha_started(_event):
        await coordinator.async_request_refresh()

    hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, _ha_started)

    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = {
        "coordinator": coordinator,
        "session": session,
    }

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    data = hass.data.get(DOMAIN, {}).pop(entry.entry_id, None)
    return unloaded


def _serialize_prog(
    prog: Optional[dict[str, Any]], now: datetime, *, is_next: bool = False
) -> Optional[dict[str, Any]]:
    if not prog:
        return None
    duration = (prog["stop"] - prog["start"]).total_seconds()
    elapsed = (now - prog["start"]).total_seconds()
    remaining = (prog["stop"] - now).total_seconds()
    starts_in = (prog["start"] - now).total_seconds()
    progress = None
    if duration > 0:
        progress = max(0.0, min(1.0, elapsed / duration))
    return {
        "id": prog.get("id"),
        "title": prog.get("title"),
        "description": prog.get("description"),
        "category": prog.get("category"),
        "start": prog["start"].isoformat(),
        "stop": prog["stop"].isoformat(),
        "photo": prog.get("photo"),
        "elapsed": max(0, int(elapsed)),
        "remaining": max(0, int(remaining)),
        "starts_in": max(0, int(starts_in)),
        "duration": int(duration),
        "progress": None if is_next else progress,
        "start_time": prog["start"].strftime("%H:%M"),
        "stop_time": prog["stop"].strftime("%H:%M"),
    }
