/*** ThermostatControl Z-Way HA module *******************************************

Version: 1.0.0
(c) Maroš Kollár, 2015
-----------------------------------------------------------------------------
Author: Maroš Kollár <maros@k-1.com>
Description:
    Control multiple radiator valves (or thermostats) using a virtual thermostat.

******************************************************************************/

function ThermostatControl (id, controller) {
    // Call superconstructor first (AutomationModule)
    ThermostatControl.super_.call(this, id, controller);
    
    this.langFile           = undefined;
    this.minTemperature     = undefined;
    this.maxTemperature     = undefined;
    this.timeouts           = [];
}

inherits(ThermostatControl, AutomationModule);

_module = ThermostatControl;

// ----------------------------------------------------------------------------
// --- Module instance initialized
// ----------------------------------------------------------------------------

ThermostatControl.prototype.init = function (config) {
    ThermostatControl.super_.prototype.init.call(this, config);
    var self = this;
    
    self.langFile           = self.controller.loadModuleLang("ThermostatControl");
    
    // Create vdev
    this.vDev = this.controller.devices.create({
        deviceId: "ThermostatControl_" + this.id,
        defaults: {
            metrics: {
                scaleTitle: config.unitTemperature === "celsius" ? '°C' : '°F',
                level: config.defaultTemperature,
                min: parseFloat(config.globalLimit.minTemperature),
                max: parseFloat(config.globalLimit.maxTemperature),
                icon: 'thermostat',
                title: self.langFile.title
            },
        },
        overlay: {
            deviceType: 'thermostat'
        },
        handler: function(command, args) {
            if (command === 'excact') {
                self.setLevel(args.level);
            }
        },
        moduleId: this.id
    });
    
    self.callbackEvent = _.bind(self.calculateSetpoint,self);
    _.each(self.presenceStates,function(presenceState) {
        self.controller.on("presence."+presenceState, self.callbackEvent);
    });
    
    setTimeout(self.callbackEvent,10000,'init');
};

ThermostatControl.prototype.stop = function() {
    var self = this;
    
    if (self.vDev) {
        self.controller.devices.remove(self.vDev.id);
        self.vDev = undefined;
    }
    
    _.each(self.presenceStates,function(presenceState) {
        self.controller.off("presence."+presenceState, self.callbackEvent);
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

ThermostatControl.prototype.presenceStates = ['home','night','away','vacation'];

ThermostatControl.prototype.calculateSetpoint = function(source) {
    var self = this;
    
    source = source || 'unknown';
    source = source.toString();
    console.log('[ThermostatControl] Calculating setpoints due to '+source);
    
    var fromZone        = source.match(/^zone\.[0-9]+$/);
    var dateNow         = new Date();
    var dayNow          = dateNow.getDay();
    var presenceNow     = self.presenceMode();
    var setpoint        = self.vDev.get('metrics:level');
    var globalSetpoint  = self.config.defaultTemperature;
    
    var evalSchedule    = function(schedule) {
        // Check presence mode
        var presenceMode = schedule.presenceMode;
        if (typeof(presenceMode) === 'object' 
            && presenceMode.length > 0
            && ! _.find(presenceMode, presenceNow)) {
            return false;
        }
        // Check day of week if set
        var dayofweek = schedule.dayofweek;
        if (typeof(dayofweek) === 'object' 
            && dayofweek.length > 0
            && ! _.find(dayofweek, dayNow.toString())) {
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
        
        if (timeFrom > dateNow || dateNow > timeTo) {
            return false;
        }
        
        console.log('[ThermostatControl] Match schedule');
        console.logJS(schedule);
        
        return true;
    };
    
    
    // Find global schedules
    _.find(self.config.globalSchedules,function(schedule) {
        if (evalSchedule(schedule) == false) {
            return;
        }
        if (schedule.mode === 'absolute') {
            globalSetpoint = parseFloat(schedule.setpoint);
        } else if (schedule.mode === 'relative') {
            globalSetpoint = self.config.defaultTemperature + parseFloat(schedule.setpoint)
        }
        globalSetpoint = self.checkLimit(globalSetpoint);
        return true;
    });
    
    // Change setpoint
    if (setpoint !== globalSetpoint
        && source !== 'setpoint' 
        && ! fromZone) {
        console.log('[ThermostatControl] Changing global to '+globalSetpoint);
        self.vDev.set('metrics:level',globalSetpoint);
    }
    
    // Process zones
    _.each(self.config.zones,function(zone,index) {
        var zoneSetpoint = globalSetpoint;
        
        if (source === 'zone.'+index 
            || ! fromZone) {
            // Find zone schedules
            _.find(zone.schedules,function(schedule) {
                if (evalSchedule(schedule) == false) {
                    return;
                }
                if (schedule.mode === 'absolute') {
                    zoneSetpoint = parseFloat(schedule.setpoint);
                } else if (schedule.mode === 'relative') {
                    zoneSetpoint = globalSetpoint + parseFloat(schedule.setpoint)
                }
                return zoneSetpoint;
            });
            zoneSetpoint = self.checkLimit(zoneSetpoint,zone.limit);
            console.log('[ThermostatControl] Changing zone '+index+' to '+zoneSetpoint);
            
            // Set devices
            _.each(zone.devices,function(device) {
                var deviceObject = self.controller.devices.get(device);
                console.log('[ThermostatControl] Setting '+deviceObject.get('metrics:title')+' to '+zoneSetpoint);
                deviceObject.performCommand('exact',{ 'level': zoneSetpoint });
            });
        }
    });
    
    self.initTimeouts();
};

ThermostatControl.prototype.presenceMode = function() {
    var self = this;
    
    var presenceMode;
    self.controller.devices.each(function(vDev) {
        if (vDev.get('deviceType') === 'switchBinary'
            && vDev.get('metrics:probeTitle') === 'presence') {
            presenceMode = vDev.get('metrics:mode');
        }
    });
    
    if (typeof(presenceMode) === 'undefined') {
        console.error('[ThermostatControl] Could not find presence device');
        return;
    }
    
    return presenceMode;
};

ThermostatControl.prototype.initTimeouts = function() {
    var self = this;
    
    _.each(self.timeouts,function(timeout) {
        clearTimeout(timeout);
    });
    self.timeouts = [];
    
    var dateNow     = new Date();
    
    _.each(self.config.globalSchedules,function(schedule) {
        var timeout = self.calculateTimeout(schedule);
        if (typeof(timeout) !== 'undefined') {
            self.timeouts.push(setTimeout(self.callbackEvent,timeout,'global'));
        }
    });
    
    _.each(self.config.zones,function(zone,index) {
        _.each(zone.schedules,function(schedule) {
            var timeout = self.calculateTimeout(schedule);
            if (typeof(timeout) !== 'undefined') {
                self.timeouts.push(setTimeout(self.callbackEvent,timeout,'zone.'+index));
            }
        });
    });
};

ThermostatControl.prototype.parseTime = function(timeString) {
    if (typeof(timeString) === 'undefined') {
        return;
    }
    
    var match       = timeString.match(/^(\d{1,2}):(\d{1,2})$/);
    if (!match) {
        return;
    }
    var hour        = parseInt(match[1]);
    var minute      = parseInt(match[2]);
    var dateCalc    = new Date();
    dateCalc.setHours(hour, minute,0,0);
    
    return dateCalc;
};


ThermostatControl.prototype.calculateTimeout = function(setpoint) {
    var self = this;
    
    var dateNow     = new Date();
    var dayofweek   = setpoint.dayofweek;
    var timeFrom    = setpoint.timeFrom;
    var timeTo      = setpoint.timeTo;
    var results     = [];
    
    if (typeof(timeFrom) === 'undefined'
        && typeof(timeTo) === 'undefined') {
        return;
    }
    
    _.each([timeFrom,timeTo],function(timeString) {
        var dateCalc = self.parseTime(timeString);
        while (dateCalc < dateNow 
            || (
                typeof(dayofweek) === 'object'
                && dayofweek.length > 0 
                && _.find(dayofweek, dateCalc.getDay().toString())
            )) {
            hour = dateCalc.getHours();
            dateCalc.setHours(dateCalc.getHours() + 24);
            dateCalc.setHours(hour);
            
        }
        results.push(dateCalc);
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

ThermostatControl.prototype.setLevel = function(level) {
    var self = this;
    level = self.checkLimit(level);
    this.set("metrics:level", level);
    self.calculateSetpoint('setpoint');
};
 