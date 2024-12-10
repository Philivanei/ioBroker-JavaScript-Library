const startValue = 4250
var isCharging = false

function startCharging() {
    setState('go-e.0.allow_charging', 1, function (err) {
        if (err) {
            console.error(err);
        } else {
            console.log('Charging started successfully.');
        }
    });
    isCharging = true;
}

function stopCharging() {
    setState('go-e.0.allow_charging', 0, function (err) {
        if (err) {
            console.error(err);
        } else {
            console.log('Charging stopped successfully.');
        }
    });
    isCharging = false;
}

setInterval(function() {
    var sunEnergy = getState("modbus.0.inputRegisters.30775_Wirkleistung_Gesamt").val;
    if (sunEnergy < 0){
        sunEnergy = 0
    }
    console.log(sunEnergy)
    var currentConsumption = sunEnergy - getState("modbus.0.inputRegisters.30867_Leistung_Netzeinspeisung").val;
    var surplus = sunEnergy - currentConsumption;
    var netUsage = getState("modbus.0.inputRegisters.30865_Leistung_Netzbezug").val;
    //pruefung ob schon stopped, dann signal nicht mehr senden schonend
    if (netUsage >= 0) {
        if (isCharging) {
            stopCharging();
        }
    } else {
        if (surplus >= startValue) {
            if (!isCharging) {
                startCharging();
            }
        }
    }
}, 10 * 60 * 1000);
