let DEBUG = true;
let tInterval = 20 * 1000; // timer interval in ms
let sensorVal = 0;
let alertTrigger1 = 0;
let alertTrigger2 = 0;
let openValveSetting = 0;
let closeValveSetting = 0;
let notifyEnabled = false;
let connectionError = true;
let alert1Shown = false;
let alert2Shown = false;
let valveOpen = false;
let communicationText = "";
let nTimerPeriod = 1000;
let nTimerHandle = -1;
let runningCalls = 0;
let messageQ = [];
let notifyTitle = "Water Tank";
let notifyMessage = "";
let notifyAccountKey = "xxxxxxxxxxxxxx";
let notifyUrl = "https://alertzy.app/send";
let sUrlParam = {
  method: "GET",
  url: "http://192.168.0.190/sensor/tank_level",
  headers: {
    "Authorization": "xxxxxxxxxxxxxx"
  }
}; // ESPHome device API call paramaters

// --- Function to set initial variables at startup ---
function setup() {
  if (DEBUG) console.log("Starting ...");
  Shelly.call("Number.GetStatus", { id: 200 }, function (result) {
    openValveSetting = result.value;
  })
  Shelly.call("Number.GetStatus", { id: 201 }, function (result) {
    closeValveSetting = result.value;
  })
  Shelly.call("Number.GetStatus", { id: 202 }, function (result) {
    alertTrigger1 = result.value;
  })
  Shelly.call("Number.GetStatus", { id: 203 }, function (result) {
    alertTrigger2 = result.value;
  })
  Shelly.call("Boolean.GetStatus", { id: 200 }, function (result) {
    notifyEnabled = result.value;
  })
}

// --- Status Handler to catch changes made to virtual component values ---
Shelly.addStatusHandler(function (status) {
  if (status.component === "number:200" && typeof (status.delta.value) !== undefined) {
    openValveSetting = status.delta.value;
  }
  if (status.component === "number:201" && typeof (status.delta.value) !== undefined) {
    closeValveSetting = status.delta.value;
  }
  if (status.component === "number:202" && typeof (status.delta.value) !== undefined) {
    alertTrigger1 = status.delta.value;
  }
  if (status.component === "number:203" && typeof (status.delta.value) !== undefined) {
    alertTrigger2 = status.delta.value;
  }
  if (status.component === "boolean:200" && typeof (status.delta.value) !== undefined) {
    notifyEnabled = status.delta.value;
  }
  if (status.component === "switch:0") {
    if (DEBUG) console.log("Switch status", status);
    if (status.delta.output === true) {
      valveOpen = true;
    };
    if (status.delta.output === false) {
      valveOpen = false;
    };
  }
})

// --- Function to get sensor value ---
function httpGetSensorValue(result, error_code, error_message) {
  if (error_code !== 0) {
    if (DEBUG) {
      console.log("httpGetSensorValue error code", error_code);
      console.log("httpGetSensorValue error message", error_message);
    }
    sensorVal = -1; // -1 on error
  } else {
    let response = JSON.parse(result.body);
    if (DEBUG) console.log("httpGetSensorValue response: ", response);
    sensorVal = response.value;
  }
}

// --- Function to control valves and set up valve status messages ---
function controlValve() {
  if (sensorVal === -1) {
    if (DEBUG) console.log("Connection Error - Closed valve");
    valveOpen = false;
    notifyMessage = "Connection Error - Closed valve";
    connectionError = true;
    // failsafe - switch off valve when no connection
    Shelly.call('Switch.set', { 'id': 0, 'on': false });
    if (notifyEnabled) messageQ.push(notifyMessage);
  }
  else if (sensorVal > 0) {
    connectionError = false;
    if (DEBUG) console.log("Sensor value", sensorVal);
    if ((parseFloat(sensorVal) >= parseFloat(closeValveSetting)) && valveOpen === true) {
      // close valve if above max
      Shelly.call('Switch.set', { 'id': 0, 'on': false });
      valveOpen = false;
      notifyMessage = "Closed valve on " + Math.round(sensorVal) + "%";
      if (DEBUG) console.log("Closed Valve");
      if (notifyEnabled) messageQ.push(notifyMessage);
    }
    if ((parseFloat(sensorVal) <= parseFloat(openValveSetting)) && valveOpen === false) {
      // open valve if below min
      Shelly.call('Switch.set', { 'id': 0, 'on': true });
      valveOpen = true;
      notifyMessage = "Opened valve on " + Math.round(sensorVal) + "%";
      if (DEBUG) console.log("Opened Valve");
      if (notifyEnabled) messageQ.push(notifyMessage);
    }
  }
}

// Function to check if alerts are triggered and setting up appropriate alert message ---
function handleAlert() {
  if ((parseFloat(sensorVal) <= parseFloat(alertTrigger1)) && !alert1Shown) {
    notifyMessage = "Alert! Water level below " + Math.round(alertTrigger1) + "%";
    if (DEBUG) console.log(notifyMessage);
    if (notifyEnabled) messageQ.push(notifyMessage);
    alert1Shown = true;
  }
  if ((parseFloat(sensorVal) >= parseFloat(alertTrigger1)) && alert1Shown) {
    notifyMessage = "Alert cleared. Water level above " + Math.round(alertTrigger1) + "%";
    if (DEBUG) console.log(notifyMessage);
    if (notifyEnabled) messageQ.push(notifyMessage);
    alert1Shown = false;
  }
  if ((parseFloat(sensorVal) <= parseFloat(alertTrigger2)) && !alert2Shown) {
    notifyMessage = "Alert! Water level below " + Math.round(alertTrigger2) + "%";
    if (DEBUG) console.log(notifyMessage);
    if (notifyEnabled) messageQ.push(notifyMessage);
    alert2Shown = true;
  }
  if ((parseFloat(sensorVal) >= parseFloat(alertTrigger2)) && alert2Shown) {
    notifyMessage = "Alert cleared. Water level above " + Math.round(alertTrigger2) + "%";
    if (DEBUG) console.log(notifyMessage);
    if (notifyEnabled) messageQ.push(notifyMessage);
    alert2Shown = false;
  }
}

// --- Function to update the home screen tank level and communication status
function updateHomeScreen() {
  (connectionError) ? communicationText = "Disconnected" : communicationText = "Connected";
  Shelly.call("Text.Set", { id: 200, value: communicationText });
  Shelly.call("Number.Set", { id: 204, value: Math.round(sensorVal) });
}

// --- Alertzy push notification send function ---
function sendPushNotification(nUrl, nAccountKey, nTitle, nMessage) {
  let request = {
    url: nUrl,
    content_type: "application/x-www-form-urlencoded",
    body:
      "accountKey=" +
      nAccountKey +
      "&title=" +
      nTitle +
      "&message=" +
      nMessage
  }
  runningCalls++;
  Shelly.call("HTTP.POST", request, function (result) {
    if (DEBUG) console.log("sendPushNotification result: ", JSON.parse(result.body));
    runningCalls--;
  });
}

// --- Function to handle message queue and send out notifications ---
function processNotifications(data) {
  if (data.timer_flag) {
    nTimerHandle = -1;
  }
  while (runningCalls < 1 && messageQ.length > 0) {
    let nMessage = messageQ.splice(0, 1)[0];
    sendPushNotification(notifyUrl, notifyAccountKey, notifyTitle, nMessage);
    if (nTimerHandle === -1 && messageQ.length > 0) {
      nTimerHandle = Timer.set(nTimerPeriod, false, processNotifications, { timer_flag: true });
    }
  }
}

// --- Do setup ---
setup();

// --- Run main loop on timer schedule ---
function tMain() {
  // get sensor value
  Shelly.call("HTTP.Request", sUrlParam, httpGetSensorValue);
  if (DEBUG) console.log("Sensor value: ", sensorVal);
  // update home screen
  updateHomeScreen();
  // control the inlet valve
  controlValve();
  // handle alerts
  if (sensorVal > 0) handleAlert();
  // handle notifications
  if (DEBUG) console.log("Message Q:", messageQ);
  processNotifications({ timer_flag: false });
}

// --- Set up main timer loop --- 
Timer.set(tInterval, true, tMain);