from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import (
    DataUpdateCoordinator,
    CoordinatorEntity,
)

from .const import DOMAIN, NAME


@dataclass
class PRDCoordinatorData:
    coordinator: DataUpdateCoordinator


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    data = hass.data[DOMAIN][entry.entry_id]
    coordinator: DataUpdateCoordinator = data["coordinator"]
    async_add_entities([
        PRDScheduleSensor(coordinator, entry),
        PRDNowSensor(coordinator, entry),
        PRDNextSensor(coordinator, entry),
    ])


class PRDScheduleSensor(CoordinatorEntity[DataUpdateCoordinator], SensorEntity):
    _attr_icon = "mdi:radio-fm"
    _attr_name = f"{NAME} Schedule"

    def __init__(self, coordinator: DataUpdateCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{entry.entry_id}_schedule"

    @property
    def native_value(self) -> str | None:
        data = self.coordinator.data or {}
        cur = data.get("current")
        return cur.get("title") if cur else None

    @property
    def extra_state_attributes(self) -> dict[str, Any] | None:
        data = self.coordinator.data or {}
        # Enrich rest_of_day entries to include leaders names and photos already prepared by coordinator
        return data


class _BaseProgSensor(CoordinatorEntity[DataUpdateCoordinator], SensorEntity):
    def __init__(self, coordinator: DataUpdateCoordinator, entry: ConfigEntry, kind: str) -> None:
        super().__init__(coordinator)
        self._kind = kind  # 'current' or 'next'
        self._attr_unique_id = f"{entry.entry_id}_{kind}"

    @property
    def _prog(self) -> dict | None:
        data = self.coordinator.data or {}
        return data.get(self._kind)

    @property
    def native_value(self) -> str | None:
        p = self._prog
        return p.get("title") if p else None

    @property
    def extra_state_attributes(self) -> dict[str, Any] | None:
        p = self._prog
        if not p:
            return None
        # Copy selected attributes
        attrs = {
            "start": p.get("start"),
            "stop": p.get("stop"),
            "start_time": p.get("start_time"),
            "stop_time": p.get("stop_time"),
            "description": p.get("description"),
            "category": p.get("category"),
            "leaders": p.get("leaders"),
            "leaders_names": p.get("leaders_names"),
            "article_link": p.get("article_link"),
            "duration": p.get("duration"),
        }
        if self._kind == "current":
            attrs.update({
                "elapsed": p.get("elapsed"),
                "remaining": p.get("remaining"),
                "progress_percent": p.get("progress_percent"),
            })
        else:
            attrs.update({
                "starts_in": p.get("starts_in"),
            })
        return attrs

    @property
    def entity_picture(self) -> str | None:
        p = self._prog
        return p.get("photo") if p else None


class PRDNowSensor(_BaseProgSensor):
    _attr_icon = "mdi:broadcast"
    _attr_name = f"{NAME} Now"

    def __init__(self, coordinator: DataUpdateCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator, entry, "current")


class PRDNextSensor(_BaseProgSensor):
    _attr_icon = "mdi:clock-outline"
    _attr_name = f"{NAME} Next"

    def __init__(self, coordinator: DataUpdateCoordinator, entry: ConfigEntry) -> None:
        super().__init__(coordinator, entry, "next")
