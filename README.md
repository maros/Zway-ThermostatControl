# Zway-ThermostatControl

Control multiple radiator valves or thermostats using a virtual thermostat
using advanced rules based on presence modes, time and day of week. The
module will create a virtual thermostat device that allows manual overriding
of the calculated setpoints.

# Configuration

## unitTemperature

Handle temperatures in Celsius or Fahrenheit

## defaultTemperature

Fallback default temperature. If no specific schedule is found, this 
temperature will be used.

## globalLimit.maxTemperature, globalLimit.minTemperature

Allows to specify optional upper and lower bounds for the virtual thermostat
and each controlled thermostat.

## globalSchedules

A list of schedules. A schedule may apply to multiple presence modes, days
of the week and have a starting and end time. Every schedule has a setpoint.
If schedules overlap, only the first matching zone will be evaluated.

## globalSchedules.presenceMode

List of presence modes (see https://github.com/maros/Zway-Presence) that this
schedule applies to. ie. allows to define low temperatures for vacations.

## globalSchedules.dayofweek

Days of the week that this schedule applies to. ie. allows to to specify
higher temperatures for the weekend.

## globalSchedules.timeFrom, globalSchedules.timeTo

Allows to specify a time (in HH:MM) when the schedule should be active.

## globalSchedules.mode, globalSchedules.setpoint

Based on the mode, a setpoint can be either absolute (eg. 19°C) or relative 
(eg. -1°C). Relative setpoints augment the defaultTemperature (and global 
setpoint for zone schedules).

eg. if the global setpoint is 20°C, and the relative zone setpoint is -2°C, 
then all radiator valves in the given zone will be set to 18°C.

In order to allow for manual thermostat overrides it is advisable to
use absolute setpoints for global schedules, and relative setpoints for
zone schedules.

## zones

Specify multiple temperature zones. Each zone may have additional schedules 
that either override, or augment the global schedules.

## zones.limit.maxTemperature, zones.limit.minTemperature

Every zone may have its own upper and lower bounds.

## devices

List of thermostats that are managed by this zone.

## zones.schedules

Multiple schedules that override the global schedules. See globalSchedules
for documentation.

# Virtual Devices

This module creates a virtual thermostat which lets you manually override the 
global setpoint. The manual override will end once the next global schedule 
change occurs.

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
