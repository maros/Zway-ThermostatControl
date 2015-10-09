/*** ThermostatControl Z-Way HA module *******************************************

Version: 1.0.0
(c) Maroš Kollár, 2015
-----------------------------------------------------------------------------
Author: maros@k-1.com <maros@k-1.com>
Description:
    Control multiple radiator valves (or thermostats) using a virtual thermostat.

******************************************************************************/

function ThermostatControl (id, controller) {
    // Call superconstructor first (AutomationModule)
    ThermostatControl.super_.call(this, id, controller);
}

inherits(ThermostatControl, AutomationModule);

_module = ThermostatControl;

// ----------------------------------------------------------------------------
// --- Module instance initialized
// ----------------------------------------------------------------------------

ThermostatControl.prototype.init = function (config) {
    ThermostatControl.super_.prototype.init.call(this, config);
    var self = this;
    
    var langFile = self.controller.loadModuleLang("ThermostatControl");
    
    this.statusId = "ThermostatControl_" + self.id;
    this.status = loadObject(this.statusId);
    this.devices = config.devices;
    
    // Initialize
    this.status.level = this.status.level || 18;
    
    // Create vdev
    this.vDev = this.controller.devices.create({
        deviceId: "ThermostatControl_" + this.id,
        defaults: {
            deviceType: 'thermostat',
            metrics: {
                scaleTitle: config.unitTemperature === "celsius" ? '°C' : '°F',
                level: self.status.level,
                min: config.minTemperature,
                max: config.maxTemperature,
                icon: '',
                title: langFile.title
            },
        },
        overlay: {
            deviceType: 'thermostat'
        },
        handler: function(command, args) {
            self.setLevel(args.level);
        },
        moduleId: this.id
    });
};

ThermostatControl.prototype.stop = function() {
    var self = this;
    
    ThermostatControl.super_.prototype.stop.call(this);
    
    if (self.vDev) {
        self.controller.devices.remove(self.vDev.id);
        self.vDev = null;
    }
};

// ----------------------------------------------------------------------------
// --- Module methods
// ----------------------------------------------------------------------------

ThermostatControl.prototype.setLevel = function(level) {
    var self = this;
    
    if (level > self.config.maxTemperature) {
        level = self.config.maxTemperature;
    } else if (level < self.config.minTemperature) {
        level = self.config.minTemperature;
    }
    
    this.set("metrics:level", level);
    
    _.each(self.devices,function(element) {
        var deviceLevel = level;
        var deviceId = element.device;
        var offset = element.offset || 0;
        var maxTemperature = element.maxTemperature || self.config.maxTemperature;
        var minTemperature = element.minTemperature || self.config.minTemperature;
        var device = self.controller.devices.get(deviceId);
        
        deviceLevel = deviceLevel + offset;
        
        if (deviceLevel > maxTemperature) {
            deviceLevel = maxTemperature;
        } else if (deviceLevel < minTemperature) {
            deviceLevel = minTemperature;
        }
        
        device.set('metrics:level',deviceLevel)
    });
};
 