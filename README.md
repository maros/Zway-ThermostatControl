# Zway-ThermostatControl

Control multiple radiator valves (or thermostats) using a virtual thermostat. 
Each controlled device can have a specified offset. Furthermore global upper
and lower bounds can be set.

# Configuration

## devices:

List of devices that should be controlled randomly

## devices.device:

Device Id

## devices.offset:

Device offset

## device.maxTemperature:

Max temperature. Global maxTemperature is used if this value is not specified

## device.minTemperature

Min temperature. Global minTemperature is used if this value is not specified

## maxTemperature:

Global maximum temperature

## minTemperature:

Global minimum temperature

# Virtual Devices

This module creates a virtual thermostat

# Events

No events are emitted

# License

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or any 
later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.
