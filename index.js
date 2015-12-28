/*** ThermostatControl Z-Way HA module *******************************************

Version: 1.03
(c) Maroš Kollár, 2015
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
    this.timeouts           = [];
}

inherits(ThermostatControl, BaseModule);

_module = ThermostatControl;

// ----------------------------------------------------------------------------
// --- Module instance initialized
// ----------------------------------------------------------------------------

ThermostatControl.prototype.init = function (config) {
    ThermostatControl.super_.prototype.init.call(this, config);
    var self = this;
    
    // Create vdev thermostat
    self.vDevThermostat = self.controller.devices.create({
        deviceId: "ThermostatControl_Thermostat_" + self.id,
        defaults: {
            metrics: {
                level: config.defaultTemperature,
                icon: 'thermostat',
                title: self.langFile.title
            },
        },
        overlay: {
            metrics: {
                min: parseFloat(config.globalLimit.minTemperature),
                max: parseFloat(config.globalLimit.maxTemperature),
                scaleTitle: config.unitTemperature === "celsius" ? '°C' : '°F'
            },
            probeType: 'ThermostatController',
            deviceType: 'thermostat'
        },
        handler: function(command, args) {
            if (command === 'exact') {
                var level = self.checkLimit(parseFloat(args.level));
                self.log('Manually change setpoint to '+level);
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
                title: self.langFile.title
            },
        },
        overlay: {
            deviceType: 'switchBinary',
            probeType: 'ThermostatController'
        },
        handler: function(command, args) {
            if (command === 'on' || command === 'off') {
                this.set('metrics:level',command);
                self.initTimeouts();
            }
        },
        moduleId: this.id
    });
    
    self.callbackEvent = _.bind(self.calculateSetpoint,self,'setpoint');
    _.each(self.presenceModes,function(presenceMode) {
        self.controller.on("presence."+presenceMode, self.callbackEvent,"presence");
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
    
    _.each(self.timeouts,function(timeout) {
        clearTimeout(timeout);
    });
    
    self.callbackEvent = undefined;
    
    ThermostatControl.super_.prototype.stop.call(this);
};

// ----------------------------------------------------------------------------
// --- Module methods
// ----------------------------------------------------------------------------

ThermostatControl.prototype.calculateSetpoint = function(source) {
    var self = this;
    
    if (self.vDevSwitch.get('metrics:level') === 'off') {
        self.log('Skipping setpoint calculation');
        return;
    }
    
    source = source || 'unknown';
    source = source.toString();
    self.log('Calculating setpoints due to '+source);
    
    var fromZone        = source.match(/^zone\.[0-9]+$/);
    var dateNow         = new Date();
    var dayNow          = dateNow.getDay();
    var presenceNow     = self.getPresenceMode();
    var setpoint        = self.vDevThermostat.get('metrics:level');
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
        var timeFrom    = self.parseTime(schedule.timeFrom);
        var timeTo      = self.parseTime(schedule.timeTo);
        if (typeof(timeFrom) === 'undefined'
            || typeof(timeTo) === 'undefined') {
            return true;
        }
        
        // TODO timeTo+24h if timeTo < timeFrom
        if (timeTo < timeFrom) {
            if (timeTo.getDate() === dateNow.getDate()) {
                var fromHour   = timeFrom.getHours();
                var fromMinute = timeFrom.getMinutes();
                timeFrom.setHours(fromHour - 24);
                // Now fix time jump on DST
                timeFrom.setHours(fromHour,fromMinute);
            } else {
                var toHour     = timeTo.getHours();
                var toMinute   = timeTo.getMinutes();
                timeTo.setHours(toHour + 24);
                // Now fix time jump on DST
                timeTo.setHours(toHour,toMinute);
            }
        }
        
        if (timeFrom > dateNow || dateNow > timeTo) {
            return false;
        }
        
        return true;
    };
    
    // Find global schedules & set global setpoint
    if (source !== 'setpoint') {
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
        // Change setpoint
        if (setpoint !== globalSetpoint
            && ! fromZone) {
            self.log('Changing global to '+globalSetpoint);
            self.vDevThermostat.set('metrics:level',globalSetpoint);
        }
    } else {
        globalSetpoint = setpoint;
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
                deviceObject.performCommand('exact',{ level: zoneSetpoint });
            });
        }
    });
    
    self.initTimeouts();
};

ThermostatControl.prototype.initTimeouts = function() {
    var self = this;
    
    _.each(self.timeouts,function(timeout) {
        clearTimeout(timeout);
    });
    self.timeouts = [];
    
    if (self.vDevSwitch.get('metrics:level') === 'off') {
        return;
    }
    
    var presence        = self.getPresenceMode();
    var dateNow         = new Date();
    
    _.each(self.config.globalSchedules,function(schedule) {
        var timeout = self.calculateTimeout(schedule,presence);
        if (typeof(timeout) !== 'undefined') {
            self.timeouts.push(setTimeout(self.callbackEvent,timeout,'global'));
        }
    });
    
    _.each(self.config.zones,function(zone,index) {
        _.each(zone.schedules,function(schedule) {
            var timeout = self.calculateTimeout(schedule,presence);
            if (typeof(timeout) !== 'undefined') {
                self.timeouts.push(setTimeout(self.callbackEvent,timeout,'zone.'+index));
            }
        });
    });
};

ThermostatControl.prototype.calculateTimeout = function(setpoint,presenceMode) {
    var self = this;
    
    var dateNow     = new Date();
    var dayofweek   = setpoint.dayofweek;
    var timeFrom    = setpoint.timeFrom;
    var timeTo      = setpoint.timeTo;
    var modes       = setpoint.presenceMode;
    var results     = [];
    
    if (typeof(timeFrom) === 'undefined'
        && typeof(timeTo) === 'undefined') {
        return;
    }
    
    if (typeof(modes) === 'object'
        && modes.length > 0
        && _.indexOf(modes, presenceMode) !== -1) {
        return;
    }
    
    _.each([timeFrom,timeTo],function(timeString) {
        var dateCalc = self.parseTime(timeString);
        while (dateCalc < dateNow 
            || (
                typeof(dayofweek) === 'object'
                && dayofweek.length > 0 
                && _.indexOf(dayofweek, dateCalc.getDay().toString()) === -1
            )) {
            var hour = dateCalc.getHours();
            var minute = dateCalc.getMinutes();
            dateCalc.setHours(hour + 24);
            dateCalc.setHours(hour,minute);
        }
        results.push(dateCalc);
        self.log('Next:'+timeString+'-'+dateCalc);
    });
    
    if (results.length === 0) {
        return;
    }
        
    results.sort();
    return (results[0].getTime() - dateNow.getTime());
};

ThermostatControl.prototype.checkLimit = function(level,limit) {
    var self = this;
    level = parseFloat(level);
    
    // TODO fallback limits?
    limit   = limit || {};
    var max = limit.maxTemperature || self.config.globalLimit.maxTemperature;
    var min = limit.minTemperature || self.config.globalLimit.minTemperature;
    
    if (typeof(max) === 'number'
        && level > max) {
        level = max;
    } else if (typeof(min) === 'number'
        && level < min) {
        level = min;
    }
    return level;
};

