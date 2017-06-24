/*** ThermostatControl Z-Way HA module *******************************************

Version: 1.07
(c) Maroš Kollár, 2015-2017
-----------------------------------------------------------------------------
Author: Maroš Kollár <maros@k-1.com>
Description:
    Control multiple radiator valves (or thermostats) using a virtual thermostat.

******************************************************************************/

function ThermostatControl (id, controller) {
    // Call superconstructor first (AutomationModule)
    ThermostatControl.super_.call(this, id, controller);

    this.minTemperature     = undefined;
    this.maxTemperature     = undefined;
    this.vDevThermostat     = undefined;
    this.vDevSwitch         = undefined;
    this.cronName           = undefined;
}

inherits(ThermostatControl, BaseModule);

_module = ThermostatControl;

// ----------------------------------------------------------------------------
// --- Module instance initialized
// ----------------------------------------------------------------------------

ThermostatControl.prototype.init = function (config) {
    ThermostatControl.super_.prototype.init.call(this, config);
    var self = this;

    self.minTemperature = parseFloat(config.globalLimit.minTemperature)
        || (config.unitTemperature === 'celsius' ? 10 : 50);
    self.maxTemperature = parseFloat(config.globalLimit.maxTemperature)
        || (config.unitTemperature === 'celsius' ? 30 : 85);

    // Create vdev thermostat
    self.vDevThermostat = self.controller.devices.create({
        deviceId: "ThermostatControl_Thermostat_" + self.id,
        defaults: {
            metrics: {
                calculatedLevel: config.defaultTemperature,
                level: config.defaultTemperature,
                icon: 'thermostat',
                title: self.langFile.m_title
            },
        },
        overlay: {
            metrics: {
                min: self.minTemperature,
                max: self.maxTemperature,
                step: self.config.unitTemperature === 'celsius' ? 0.5 : 1,
                scaleTitle: config.unitTemperature === "celsius" ? '°C' : '°F'
            },
            probeType: 'thermostat_set_point',
            deviceType: 'thermostat'
        },
        handler: function(command, args) {
            if (command === 'exact') {
                var level = self.checkLimit(parseFloat(args.level));
                self.log('Manually changing setpoint to '+level);
                self.vDevThermostat.set("metrics:level", level);
                self.calculateSetpoint('setpoint');
            }
        },
        moduleId: this.id
    });

    // Create vdev switch
    self.vDevSwitch = self.controller.devices.create({
        deviceId: "ThermostatControl_Switch_" + self.id,
        defaults: {
            metrics: {
                level: 'on',
                icon: 'thermostat',
                title: self.langFile.m_title
            },
        },
        overlay: {
            deviceType: 'switchBinary',
            probeType: 'thermostat_mode'
        },
        handler: function(command, args) {
            var oldLevel = this.get('metrics:level');
            if (command === 'on' || command === 'off') {
                this.set('metrics:level',command);
                if (oldLevel !== command && command === 'on') {
                    self.calculateSetpoint('setpoint');
                }
            }
        },
        moduleId: this.id
    });

    self.cronName       = 'ThermostatControl.'+self.id+'.cron';
    self.callbackEvent  = _.bind(self.calculateSetpoint,self);

    self.controller.on(self.cronName,self.callbackEvent);

    // Init presence change callbacks
    _.each(self.presenceModes,function(presenceMode) {
        self.controller.on("presence."+presenceMode, self.callbackEvent);
    });

    // Init cron times
    _.each(self.config.globalSchedules,function(schedule) {
        self.initSchedule(schedule,'global');
    });

    _.each(self.config.zones,function(zone,index) {
        _.each(zone.schedules,function(schedule) {
            self.initSchedule(schedule,'zone.'+index);
        });
    });

    setTimeout(self.callbackEvent,10000,'init');
};

ThermostatControl.prototype.stop = function() {
    var self = this;

    if (self.vDevThermostat) {
        self.controller.devices.remove(self.vDevThermostat.id);
        self.vDevThermostat = undefined;
    }

    if (self.vDevSwitch) {
        self.controller.devices.remove(self.vDevSwitch.id);
        self.vDevSwitch = undefined;
    }

    _.each(self.presenceModes,function(presenceMode) {
        self.controller.off("presence."+presenceMode, self.callbackEvent);
    });

    self.controller.off(self.cronName,self.callbackEvent);
    self.controller.emit("cron.removeTask",self.cronName);

    self.callbackEvent = undefined;

    ThermostatControl.super_.prototype.stop.call(this);
};

// ----------------------------------------------------------------------------
// --- Module methods
// ----------------------------------------------------------------------------

ThermostatControl.prototype.initSchedule = function(schedule,id) {
    var self = this;

    if (typeof(schedule.timeFrom) === 'undefined'
        || typeof(schedule.timeTo) === 'undefined')
        return;

    _.each(['timeFrom','timeTo'],function(timeString) {
        var date        = self.parseTime(schedule[timeString]);
        if (schedule.dayofweek.length === 0
            || schedule.dayofweek.length === 7) {
            self.controller.emit("cron.addTask",self.cronName, {
                minute:     date.getMinutes(),
                hour:       date.getHours(),
                weekDay:    null,
                day:        null,
                month:      null,
            },id);
        } else {
            _.each(schedule.dayofweek,function(dayofweek) {
                self.controller.emit("cron.addTask",self.cronName, {
                    minute:     date.getMinutes(),
                    hour:       date.getHours(),
                    weekDay:    parseInt(dayofweek,10),
                    day:        null,
                    month:      null,
                },id);
            });
        }
    });
};

ThermostatControl.prototype.calculateSetpoint = function(source) {
    var self = this;

    if (self.vDevSwitch.get('metrics:level') === 'off') {
        self.log('Skipping setpoint calculation');
        return;
    }

    source = source || 'unknown';
    if (typeof(source) === 'object'
        && typeof(source.hour) !== 'undefined') {
        source = 'Cron ' + source.hour + ':' + source.minute;
    }
    source = source.toString();
    self.log('Calculating setpoints due to '+source);

    var fromZone        = source.match(/^zone\.[0-9]+$/);
    var dateNow         = new Date();
    var dayNow          = dateNow.getDay();
    var presenceNow     = self.getPresenceMode();
    var curSetpoint     = self.vDevThermostat.get('metrics:level');
    var calcSetpoint    = self.vDevThermostat.get('metrics:calculatedLevel');
    var globalSetpoint  = self.config.defaultTemperature;

    var evalSchedule    = function(schedule) {
        // Check presence mode
        if (typeof(schedule.presenceMode) === 'object'
            && schedule.presenceMode.length > 0
            && _.indexOf(schedule.presenceMode, presenceNow) === -1) {
            return false;
        }

        // Check day of week if set
        if (typeof(schedule.dayofweek) === 'object'
            && schedule.dayofweek.length > 0
            && _.indexOf(schedule.dayofweek, dayNow.toString()) === -1) {
            return false;
        }

        // Check from/to time
        return self.checkPeriod(schedule.timeFrom,schedule.timeTo);
    };

    // Find global schedules & set global setpoint
    if (source !== 'setpoint'
        && ! fromZone) {
        _.find(self.config.globalSchedules,function(schedule) {
            if (evalSchedule(schedule) === false) {
                self.log('No global match');
                return;
            }
            if (schedule.mode === 'absolute') {
                globalSetpoint = parseFloat(schedule.setpoint);
            } else if (schedule.mode === 'relative') {
                globalSetpoint = self.config.defaultTemperature + parseFloat(schedule.setpoint);
            }
            globalSetpoint = self.checkLimit(globalSetpoint);
            return true;
        });
        self.vDevThermostat.set('metrics:calculatedLevel',globalSetpoint);
        // Change setpoint
        if (curSetpoint !== globalSetpoint) {

            // Was changed manually - not going to change on restart
            if (source === 'init'
                && calcSetpoint !== curSetpoint) {
                self.log('Not changing manual global setpoint to '+globalSetpoint);
                globalSetpoint = curSetpoint;
            } else {
                self.log('Changing global setpoint to '+globalSetpoint);
                self.vDevThermostat.set('metrics:level',globalSetpoint);
            }
        }
    } else {
        globalSetpoint = curSetpoint;
    }

    // Process zones
    _.each(self.config.zones,function(zone,index) {
        var zoneSetpoint = globalSetpoint;

        if (source === 'zone.'+index
            || ! fromZone) {
            // Find zone schedules
            _.find(zone.schedules,function(schedule) {
                if (evalSchedule(schedule) === false) {
                    return;
                }
                if (schedule.mode === 'absolute') {
                    zoneSetpoint = parseFloat(schedule.setpoint);
                } else if (schedule.mode === 'relative') {
                    zoneSetpoint = globalSetpoint + parseFloat(schedule.setpoint);
                }
                return zoneSetpoint;
            });
            zoneSetpoint = self.checkLimit(zoneSetpoint,zone.limit);
            self.log('Changing zone '+index+' to '+zoneSetpoint);

            // Set devices
            self.processDeviceList(zone.devices,function(deviceObject) {
                self.log('Setting '+deviceObject.get('metrics:title')+' to '+zoneSetpoint);
                deviceObject.set('metrics:calculatedLevel',zoneSetpoint);
                deviceObject.performCommand('exact',{ level: zoneSetpoint });
            });
        }
    });

};

ThermostatControl.prototype.checkLimit = function(level,limit) {
    var self = this;
    level = parseFloat(level);

    // TODO fallback limits?
    limit   = limit || {};
    var max = limit.maxTemperature || self.maxTemperature;
    var min = limit.minTemperature || self.minTemperature;

    if (typeof(max) === 'number'
        && level > max) {
        level = max;
    } else if (typeof(min) === 'number'
        && level < min) {
        level = min;
    }

    return Math.round(level*2)/2;
};

