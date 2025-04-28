const changeThreshs = [1400, 2400, 3300, 4300, 5700, 7000]; // -> watt
// ampere:             6   , 10  , 14  , 6   , 8   , 10
// phase:              1   , 1   , 1   , 3   , 3   , 3

let lastPhaseCode = 0;
let lastAmpRate = 0;
// isCharging gets synced correctly after first state change
let isCharging = false;

function startCharging() {
    if (!isCharging) {
        setState('go-e.0.allow_charging', 1, function (err) {
            if (err) {
                console.error(err);
            } else {
                console.log('Charging started successfully.');
                isCharging = true;
            }
        });
    }
}

function stopCharging() {
    if (isCharging) {
        setState('go-e.0.allow_charging', 0, function (err) {
            if (err) {
                console.error(err);
            } else {
                console.log('Charging stopped successfully.');
                isCharging = false;
            }
        });
    }
}

function changePhase(phaseCode) {
/* switching phases during charging is only possible with go-e charger homefix's most recent hardware v3
the process of changing phases takes at least 30 seconds until car is charging again */
    if (lastPhaseCode != phaseCode) {
        switch (phaseCode) {
            case 1:
                console.log("Set charging phase to 1 phase usage.");
                sendCustomWebRequest("set?psm=1");
                lastPhaseCode = phaseCode;
                break;
            case 2:
                console.log("Set charging phase to 3 phase usage.");
                sendCustomWebRequest("set?psm=2");
                lastPhaseCode = phaseCode;
                break;
            default:
                lastPhaseCode = phaseCode;
                console.error(`PhaseCode ${phaseCode} is not valid. Valid codes are 1 for one phase and 2 for three phase charging.`);
        }
    } else {
        console.log("lastPhaseCode was equals to phaseCode! No phase change necessary!");
    }
}

function sendCustomWebRequest(urlCommand) {
    // http api v2 of go-e charger has to be enabled
    // TODO: SET THE IP OF YOUR CHARGER
    let url = `http://xxx.xxx.xxx.xx/api/${urlCommand}`;
    const axios = require('axios');
    const options = {
    method: 'GET',
    headers: {
        'User-Agent': 'axios'
        }
    };
    axios(url, options).then(response => {
        const info = response.data;
        console.log(`Response: ${info.psm} -> phase-change successfully`);
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
            changeAmpere(6, 1);
            changePhase(1);
            break;
        case 1:
            changeAmpere(10, 1);
            changePhase(1);
            break;
        case 2:
            changeAmpere(14, 1);
            changePhase(1);
            break;
        case 3:
            changeAmpere(6, 2);
            changePhase(2);
            break;
        case 4:
            changeAmpere(8, 2);
            changePhase(2);
            break;
        case 5:
            changeAmpere(10, 2);
            changePhase(2);
            break;
        default:
            if (chargingLevel == 99) {
                console.log(`Charging level: ${chargingLevel} -> No surplus available.`);
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
    console.log(`Current charging level is ${chargingLevel}`);
    return chargingLevel;
}

function chargingActivity(surplus) {
    console.log(`Charging granted. Surplus value: ${surplus}W`);
    let chargingLevel = calculateChargingLevel(surplus);
    setChargingPower(chargingLevel);
    startCharging();
}

setInterval(function() {
    let sunEnergy = getState("modbus.0.inputRegisters.30775_Wirkleistung_Gesamt").val;
    if (sunEnergy < 0) {
        sunEnergy = 0;
    }
    let currentConsumption = sunEnergy - getState("modbus.0.inputRegisters.30867_Leistung_Netzeinspeisung").val;
    let surplus = sunEnergy - currentConsumption;
    let surplusCar = surplus + getState("go-e.0.energy.power").val * 1000;
    let netUsage = getState("modbus.0.inputRegisters.30865_Leistung_Netzbezug").val;

    if (getState("go-e.0.car").val == 1) {
        console.log(`No car connected to charger (ChargerStatus: ${getState("go-e.0.car").val}).`);
        stopCharging();
    } else {
        if (netUsage > 0) {
            console.log(`Using public electricity power ${netUsage}W. Evaluate charging again ...`);
            if (calculateChargingLevel(surplusCar) == 99) {
                stopCharging();
            } else {
                chargingActivity(surplusCar);
            }
        } else {
            if (surplusCar >= changeThreshs[0]) {
                chargingActivity(surplusCar);
            } else {
                console.log(`Surplus value ${surplusCar}W too low to start charging. ${changeThreshs[0]}W have to be available at least.`)
            }
        }
    }
// TODO: SET THE EXECUTION FREQUENCY
}, 7 * 60 * 1000);
// min  sec  micro
