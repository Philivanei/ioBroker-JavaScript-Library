const changeThreshs = [1400, 2400, 3300, 4300, 5650, 7000]; // -> watt
// ampere:             6   , 10  , 14  , 6   , 8   , 10
// phase:              1   , 1   , 1   , 3   , 3   , 3

let lastPhaseCode = 0;
let lastAmpRate = 0;
let isCharging = false;

function startCharging() {
    setState('go-e.0.allow_charging', 1, function (err) {
        if (err) {
            console.error(err);
        } else {
            console.debug('Charging started successfully.');
        }
    });
    isCharging = true;
}

function stopCharging() {
    setState('go-e.0.allow_charging', 0, function (err) {
        if (err) {
            console.error(err);
        } else {
            console.debug('Charging stopped successfully.');
        }
    });
    isCharging = false;
}

function changePhase(phaseCode) {
/* switching phases during charging is only possible with go-e charger homefix's most recent hardware v3
the process of changing phases takes at least 30 seconds until car is charging again */
    if (lastPhaseCode != phaseCode) {
        switch (phaseCode) {
            case 1:
                console.debug("Set charging phase to 1 phase usage.");
                sendCustomWebRequest("set?psm=1");
                lastPhaseCode = phaseCode;
                break;
            case 2:
                console.debug("Set charging phase to 3 phase usage.");
                sendCustomWebRequest("set?psm=2");
                lastPhaseCode = phaseCode;
                break;
            default:
                lastPhaseCode = phaseCode;
                console.error(`PhaseCode ${phaseCode} is not valid. Valid codes are 1 for one phase and 2 for three phase charging.`);
        }
    } else {
        console.debug("lastPhaseCode was equals to phaseCode! No phase change necessary!");
    }
}

function sendCustomWebRequest(urlCommand) {
    // http api v2 of go-e charger has to be enabled
    let url = `http://192.168.178.47/api/${urlCommand}`;
    const axios = require('axios');
    const options = {
    method: 'GET',
    headers: {
        'User-Agent': 'axios'
        }
    };
    axios(url, options).then(response => {
        const info = response.data;
        console.debug(`Response: ${info.psm} -> phase-change successfully`);
    }).catch(error => {
        console.error(`Error: ${error}`);
    });
}

function changeAmpere(ampAmount, phaseCode) {
    if (lastAmpRate != ampAmount || lastPhaseCode != phaseCode) {
        setState('go-e.0.ampere', ampAmount, function (err) {
            if (err) {
                console.error(err);
            } else {
                lastAmpRate = ampAmount;
                console.log('Changed charging power successfully.');
            }
        });
    }
}

function setChargingPower(chargingLevel) {
    switch (chargingLevel) {
        case 0:
            console.debug(`Surplus bigger than ${changeThreshs[0]}`);
            changeAmpere(6, 1);
            changePhase(1);
            break;
        case 1:
            console.debug(`Surplus bigger than ${changeThreshs[1]}`);
            changeAmpere(10, 1);
            changePhase(1);
            break;
        case 2:
            console.debug(`Surplus bigger than ${changeThreshs[2]}`);
            changeAmpere(14, 1);
            changePhase(1);
            break;
        case 3:
            console.debug(`Surplus bigger than ${changeThreshs[3]}`);
            changeAmpere(6, 2);
            changePhase(2);
            break;
        case 4:
            console.debug(`Surplus bigger than ${changeThreshs[4]}`);
            changeAmpere(8, 2);
            changePhase(2);
            break;
        case 5:
            console.debug(`Surplus bigger than ${changeThreshs[5]}`);
            changeAmpere(10, 2);
            changePhase(2);
            break;
        default:
            if (chargingLevel == 99) {
                console.debug(`Charging level: ${chargingLevel} -> No surplus available.`);
            } else {
            console.error(`Charging level: ${chargingLevel} -> Power level calculation is broken!`);
            }
    }
}

function calculateChargingLevel(surplus) {
    let chargingLevel = 99
    for (let i = 0; i < changeThreshs.length; i++) {
        if (surplus > changeThreshs[i]) {
            chargingLevel = i;
        } else {
            break;
        }
    }
    console.debug(`Charging level is ${chargingLevel}`);
    return chargingLevel;
}

setInterval(function() {
    let sunEnergy = getState("modbus.0.inputRegisters.30775_Wirkleistung_Gesamt").val;
    if (sunEnergy < 0) {
        sunEnergy = 0;
    }
    let currentConsumption = sunEnergy - getState("modbus.0.inputRegisters.30867_Leistung_Netzeinspeisung").val;
    let surplus = sunEnergy - currentConsumption;
    let netUsage = getState("modbus.0.inputRegisters.30865_Leistung_Netzbezug").val;
    // If receiving electricity from public -> no charging
    if (netUsage >= 0) {
        if (isCharging) {
            stopCharging();
        }
    } else {
        if (surplus >= changeThreshs[0]) {
            console.debug(`Surplus value: ${surplus}`);
            let chargingLevel = calculateChargingLevel(surplus);
            setChargingPower(chargingLevel);
            if (!isCharging) {
                startCharging();
            }
        }
    }
}, 10 * 60 * 1000);
// min  sec  micro
