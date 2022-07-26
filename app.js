// @Author Adu Wesley Young
// @LinkedIn https://linkedin.com/wicfasho
// @Github https://github.com/wicfasho //99.99% of my projects are Private (LOL)
// @Licence NONE
// @Problem Service Downtime was somthing we contantly battled at work due to some processes not being scaled. The solution was to restart the window service where the application run. I am too Lazy to always have to RDP to different servers to restart their services.
// @Solution #Description As a lover of automations, I decided to automate this process by pinging the website in intervals and restart when not reachable.
// @Important OPEN Powershell/CLI as an Administrator to run node

var http = require('http');
var cp = require('child_process');
var fs = require('fs')

const log = require('ololog').configure({ time: true })
const ansi = require('ansicolor').nice
const config = require('./config');

var logsileName = "./logs.json";
var logsJson = require(logsileName);

const optionsGET = {
    timeout: 30000 //Wait 30 Seconds for site load
};

var hosts = config.sites.map(element => element.uri);

var site_state_variables = config.sites.map(element => 
    ({
        "uri": element.uri,
        "restart_in_progress": false,
        "failure_count": 0
    })
);

function start(){
    hosts.forEach( async (host) => {
        host.trim();

        var site = config.sites.filter(element => element.uri.trim() == host)[0];

        const request = http.get(host, optionsGET, (res) => {
            if( res.statusCode == 200 ){
                site_state_variables[site_state_variables.findIndex(element => element.uri == site.uri)].failure_count = 0;
                log(`[Web] ${host} is alive`.green);
                
                request.shouldKeepAlive = false;
                console.log("Heartbeat...\n");
                setTimeout( () => {
                    start();
                }, site.check_interval)
            }else{
                log(`[Web] ${host} is dead`.red);
                let failure_count = ++site_state_variables[site_state_variables.findIndex(element => element.uri == site.uri)].failure_count; // @update state variable

                var log_msg = `Restarting the service [${site.window_service_name}]...${failure_count}`;
                console.log(log_msg);
                saveLog({
                    "date": Date(),
                    "msg": `Host is not reachable. Status Code is ${res.statusCode}`
                })
                setTimeout( () => { restartService(site); }, 1000)
            }
        })

        request.on('timeout', () => {
            let failure_count = ++site_state_variables[site_state_variables.findIndex(element => element.uri == site.uri)].failure_count;

            var log_msg = `TIMEOUT: Can not reach host ${host}`;
            log(log_msg.red)
            saveLog({
                "date": Date(),
                "msg": log_msg
            })
            request.shouldKeepAlive = false;
            console.log(`Restarting the service [${site.window_service_name}]...${failure_count}\n`);
            setTimeout( () => { restartService(site); }, 5000)
        });

        request.on('error', function(e){
            let failure_count = ++site_state_variables[site_state_variables.findIndex(element => element.uri == site.uri)].failure_count;

            var log_msg = `ERROR: Can not reach host ${host}`;
            log(log_msg.red)
            saveLog({
                "date": Date(),
                "msg": log_msg
            })
            request.shouldKeepAlive = false;
            console.log(`Restarting the service [${site.window_service_name}]...${failure_count}\n`);
            setTimeout( () => { restartService(site); }, 5000)
        });
    });
}

function saveLog(details_object){
    fs.readFile(logsileName, function (err, data) {
        if (err){
          console.log(err);
        }
        else {
            var json = JSON.parse(data)
            json.push(details_object)
        
            fs.writeFile(logsileName, JSON.stringify(json), (err) => {

            })
        }
    })
}

function restartService(site){
    let uri = site.uri;
    let service = site.window_service_name;
    let failure_count_before_restart = site.failure_count_before_restart;

    let restart_in_progress = site_state_variables.filter(element => element.uri == uri)[0].restart_in_progress;
    let failure_count = site_state_variables.filter(element => element.uri == uri)[0].failure_count;
    
    if(Number(failure_count) < Number(failure_count_before_restart)){
        start();
        return false;
    }else{
        if(!restart_in_progress){
            restart_in_progress = true;
            site_state_variables[site_state_variables.findIndex(element => element.uri == uri)].restart_in_progress = true;

            //reset count
            failure_count = site_state_variables[site_state_variables.findIndex(element => element.uri == uri)].failure_count = 0;

            // @notice Check the current state of the World Wide Web Publishing Service service (for IIS) 
            var child = cp.exec('SC QUERYEX w3svc | FIND "STATE" | FIND /v "RUNNING" > NUL && (echo 0) || (echo 1)', function (error, stdout, stderr) {
                if (error !== null) {
                    console.log('exec error: ' + error);
                    setTimeout( () => { start(); }, 2000)
                }
                else{
                    let cp_command_w3svc = "NET STOP w3svc && NET START w3svc";
                    // @notice If service is not running
                    if(stdout.trim() == 0){
                        cp_command_w3svc = "NET START w3svc";
                    }

                    // @notice Run Command to Start WWW Pub Service
                    // @notice Better than using "iisreset"
                    cp.exec(cp_command_w3svc, function (error, stdout, stderr) {
                        if (error !== null) {
                            console.log(error);
                            setTimeout( () => { start(); }, 2000)
                        }else{                            
                            console.log(stdout)

                            // @notice Check current state of Website Service
                            cp.exec(`SC QUERYEX ${service} | FIND "STATE" | FIND /v "RUNNING" > NUL && (echo 0) || (echo 1)`, function (error, stdout, stderr) {
                                if (error !== null) {
                                    console.log('exec error: ' + error);
                                    return false;
                                }
                                else{
                                    let cp_command_service = `NET STOP ${service} && NET START ${service}`;
                                    // @notice Check if service is not running
                                    if(stdout.trim() == 0){
                                        cp_command_service = `NET START ${service}`;
                                    }

                                    // @notice Start Service
                                    cp.exec(cp_command_service, function (error, stdout, stderr) {
                                        if (error !== null) {
                                            console.log(error);
                                            setTimeout( () => { restartService(site); }, 5000)
                                        }else{
                                            restart_in_progress = false;
                                            console.log(stdout)
                                            log("RESTARTED!!! I DIT IT! \n\n".bright.green);
                                            setTimeout( () => { start(); }, 2000)
                                        }
                                    })
                                }
                            })
                        }

                    })
                }
            })
        }
        else{
            //@notice Exit! There is pending restart. @comment Thanks for trying. You were not as fast.
            return false;
        }
    }
}

start();