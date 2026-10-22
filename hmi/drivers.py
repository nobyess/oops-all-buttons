"""Protocol boundary. Implement Driver and add a factory to DRIVERS."""
from typing import Protocol


class Driver(Protocol):
    def browse(self) -> list[dict]: ...
    def read(self, address: str) -> float: ...
    def write(self, address: str, value: float) -> None: ...
    def close(self) -> None: ...
    def status(self) -> dict: ...


class MemoryDriver:
    """Safe simulation; values reset when the server restarts."""
    def __init__(self, settings):
        self.values = {}

    def browse(self):
        return [{'address': key, 'value': value} for key, value in self.values.items()]

    def read(self, address):
        return self.values.get(address, 0)

    def write(self, address, value):
        self.values[address] = value

    def close(self):
        pass

    def status(self):
        return {'quality': 'good', 'message': 'Simulation connected'}


from .pycomm3_logix import PyComm3LogixDriver

from .pycomm3_modes import create_driver

from .sheet import SheetDriver

from .bacnet import BACnetDriver

from .mqtt import MQTTDriver

from .modbus import ModbusTCPDriver

from .local_drivers import SystemDriver, DatabaseDriver

from .simulation import SimulationDriver

from .lightyak import LightYakDriver

DRIVERS = {'simulation':SimulationDriver,'system':SystemDriver,'database':DatabaseDriver,'memory': MemoryDriver, 'pycomm3': create_driver, 'bacnet': BACnetDriver, 'sheet': SheetDriver, 'mqtt': MQTTDriver, 'modbus': ModbusTCPDriver, 'lightyak':LightYakDriver}
