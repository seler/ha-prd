from __future__ import annotations

from typing import Any

from homeassistant import config_entries
from homeassistant.core import callback

from .const import DOMAIN

class PRDConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None):
        return self.async_create_entry(title="Polskie Radio Dzieciom", data={})

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        return PRDOptionsFlowHandler(config_entry)

class PRDOptionsFlowHandler(config_entries.OptionsFlow):
    def __init__(self, config_entry: config_entries.ConfigEntry) -> None:
        self.config_entry = config_entry

    async def async_step_init(self, user_input: dict[str, Any] | None = None):
        return self.async_create_entry(title="Options", data={})
