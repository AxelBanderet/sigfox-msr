//Main class

var express = require("express");
var myParser = require("body-parser");
var hexToBinary = require('hex-to-binary');
var app = express();

const { Client } = require('pg')
const client = new Client({
    connectionString: '[Insert your database connection string here]',
    ssl: true,
});
client.connect();

const oneMonthTimestampDuration = 2678400000;
var humidity = new String("humidity");
var temperature = new String("temperature");
var mapHumidityTemperature = new Map();
var humidityDisplayed = new String();
var temperatureDisplayed = new String();
var finalHumidity = new String();
var finalTemperature = new String();
var result;
var listHumidity=[];
var listTemperature=[];

app.use(myParser.json({extended : true}));

app.post("/data", function(request, response) {
    storeData(request, response);
    response.end("Success");
});

app.post("/event", function(request, response) {
    setTimeout(function(){
        storeEventData(request, response);
        response.end("Success");
    }, 2000);
});

app.get("/msr", function(request, response) {
    var messageSuccessRate = 0;
    var timeNow = Date.now();
    var timeNowMinusOneMonth = timeNow-oneMonthTimestampDuration;
    var totalNumberOfLostMessages = 0;

    client.query("select * from t_eventdata where eventtime between '" + timeNowMinusOneMonth  + "' AND '" + timeNow + "'", (err, res) => {
        if (err) throw err;
        result = res.rows;
            for (var i = 0; i < res.rowCount; i++) {
                var rowLostMessages = parseInt(result[i].numberoflostmessages, 10);
                totalNumberOfLostMessages += rowLostMessages;
            }
    });

    client.query("select * from t_data where timestamp >  '" + timeNowMinusOneMonth  + "'", (err, res) => {
        if (err) throw err;
        var result = res.rows;
        var oldestSeqNum = result[0].seqnum;
        var youngestSeqNum = result[result.length-1].seqnum;
        var numberOfMessagesSent = youngestSeqNum-oldestSeqNum;
        var numberOfMessagesReceived = numberOfMessagesSent-totalNumberOfLostMessages;
        var messageSuccessRate = numberOfMessagesReceived/numberOfMessagesSent;
        var messageSuccessRatePercentage = messageSuccessRate*100;
        response.write("Average Message Success Rate for the last 30 days: " + messageSuccessRatePercentage + "%.");
        response.write("\n");
        response.write("Details: \n"); 
        response.write("Number of messages sent: " + numberOfMessagesSent + ".");
        response.write("\n");
        response.write("Number of messages received: " + numberOfMessagesReceived + ".");
        return response.end();
    });
});

app.get("/data", function(request, response){
    client.query("select * from t_data;", (err, res) => {
        if (err) throw err;
        result = res.rows;
        for (var i = 0; i < res.rowCount; i++) {
            mapHumidityTemperature = parseData(result[i].payload);
            humidityDisplayed = mapHumidityTemperature.get(humidity);
            temperatureDisplayed = mapHumidityTemperature.get(temperature);
            listHumidity[i]=humidityDisplayed;
            listTemperature[i]=temperatureDisplayed;
        }
        if (listHumidity.size == 0) {
            response.end("Welcome on this website.");
        } else {
            response.write(JSON.stringify(listHumidity));
            response.write(JSON.stringify(listTemperature));
            return response.end();
        }
    });
});
app.listen(process.env.PORT || 5000);

function storeData(request, response){
    var timeMs = request.body.time*1000;
    client.query("insert into t_data(deviceid, payload, seqnum, timestamp) values ('" + request.body.device + "', '" + request.body.data + "', '" + request.body.seqNumber + "', '" + timeMs + "');", (err, res) => {
        if (err) throw err;
        for (let row of res.rows) {
          console.log(JSON.stringify(row));
        }
      });
}

function storeEventData(request, response){    
    var numberOfLostMessages = request.body.deviceMessageSeqnumber-request.body.deviceLastSeqnumber;
    var deviceMessageTimestamp = Date.parse(request.body.deviceMessageTime);
    var eventTimeMs = request.body.time*1000;
    client.query("insert into t_eventdata(deviceid, numberoflostmessages, devicemessagetime, eventtime) values ('" + request.body.deviceId + "', '" + numberOfLostMessages + "', '" + deviceMessageTimestamp + "', '" + eventTimeMs + "');", (err, res) => {
        if (err) throw err;
        for (let row of res.rows) {
          console.log(JSON.stringify(row));
        }
      });
}

function parseData(data){
    var binaryData = hexToBinary(data);
    var humidityBinaryData = binaryData.substring(binaryData.length-8, binaryData.length);
    var temperatureBinaryData = binaryData.substring(binaryData.length-17 , binaryData.length-8);
    var humidityDecimalData = parseInt(humidityBinaryData, 2);
    var temperatureDecimalData = parseInt(temperatureBinaryData, 2);
    var humidityResult = humidityDecimalData/2;
    var temperatureResult = (temperatureDecimalData-200)/8;
    mapHumidityTemperature.set(humidity, humidityResult);
    mapHumidityTemperature.set(temperature, temperatureResult);
    return mapHumidityTemperature;
}


