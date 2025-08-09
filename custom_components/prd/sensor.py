from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, CoordinatorEntity

from .const import DOMAIN, NAME

@dataclass
class PRDCoordinatorData:
    coordinator: DataUpdateCoordinator

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    data = hass.data[DOMAIN][entry.entry_id]
    coordinator: DataUpdateCoordinator = data["coordinator"]
    async_add_entities([PRDScheduleSensor(coordinator, entry)])

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
        return self.coordinator.data or {}
