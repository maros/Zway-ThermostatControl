# Zway-ThermostatControl

Control multiple radiator valves or thermostats using a virtual thermostat
using advanced schedules based on presence modes, time and day of week. The
module will create a virtual thermostat device that allows manual overriding
of the calculated setpoints. It also creates a binary switch that allows
to entirely disable the thermostat (eg. for summer or for manual overrides)

Multiple radiator valves or thermostats may be grouped in a zone. These zones
may have additional schedules that either override (absolute setpoints) or 
augment the global schedules (relative setpoints)

# Configuration

This module requires the Presence module 
(see https://github.com/maros/Zway-Presence), or any other module that behaves
the same to be installed first. If you don't want to use the given presence 
module, just must create a virtual switchBinary device, using 'Presence' as a 
probeTitle and use 'metrics:mode' to store the presence mode. The module 
should also emit events on switching modes (see Events)

## unitTemperature

Handle temperatures in Celsius or Fahrenheit

## defaultTemperature

Fallback default temperature. If no specific schedule is found, this 
temperature will be used.

## globalLimit.maxTemperature, globalLimit.minTemperature

Allows to specify optional upper and lower bounds for the virtual thermostat
and each controlled thermostat.

## globalSchedules

A list of global schedules. A schedule may apply to one or multiple presence 
modes, days of the week and have a starting and end time. Every schedule has 
a setpoint. If schedule rules overlap, only the first matching schedule will 
be processed. The order of schedules therefore matters.

## globalSchedules.presenceMode

List of presence modes (see https://github.com/maros/Zway-Presence) that this
schedule applies to. ie. allows to define lower temperatures for vacations and
away modes. Supported presence modes are

* Home: At home during daytime
* Night: At Home during nighttime / Sleeping
* Away: Away - both day and night)
* Vacation: Prolonged absence - both day and night

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
that either override (absolute setpoints), or augment (relative setpoints) 
the global schedules.

## zones.limit.maxTemperature, zones.limit.minTemperature

Every zone may have its own upper and lower bounds. If no values are set,
globalLimit.maxTemperature and globalLimit.minTemperature will be used.

## devices

List of thermostats that are managed in this zone.

## zones.schedules

Multiple schedules that override the global schedules. See globalSchedules
for documentation.

# Virtual Devices

This module creates a virtual thermostat which lets you manually override the 
global setpoint. The manual override will end once the next global schedule 
change occurs.

A binary switch will also be created, allowing for disabling automated
thermostat setpoints. (eg. for summer or for manual overrides)

# Events

No events are emitted.

The module listens to the following events, which are usually emitted by
the Presence module ( https://github.com/maros/Zway-Presence ), but may 
originate from any other module.

* presence.home
* presence.away
* presence.vacation
* presence.night

# Installation

Install the BaseModule from https://github.com/maros/Zway-BaseModule first

```shell
cd /opt/z-way-server/automation/modules
git clone https://github.com/maros/Zway-ThermostatControl.git ThermostatControl --branch latest
```

To update or install a specific version
```shell
cd /opt/z-way-server/automation/modules/ThermostatControl
git fetch --tags
# For latest released version
git checkout tags/latest
# For a specific version
git checkout tags/1.02
# For development version
git checkout -b master --track origin/master
```

Alternatively this module can be installed via the Z-Wave.me app store. Just
go to Management > App Store Access and add 'k1_beta' access token. 

# License

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or any 
later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.
