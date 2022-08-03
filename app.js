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
const { resolve } = require('path');
const { rejects } = require('assert');

var logsileName = "./logs.json";
var logsJson = require(logsileName);

const optionsGET = {
    timeout: 30000 //Wait 30 Seconds for site load
};

var hosts = config.sites.map(element => element.uri);

//Run time state variables
var site_state_variables = config.sites.map(element => 
    ({
        "uri": element.uri,
        "restart_in_progress": false,
        "failure_count": 0,
        "restart_count": {
            "iis": 0,
            "app_service": 0
        }
    })
);

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

async function runCMD(command){
    return new Promise( (resolve,reject) => {
        let result = {}
        cp.exec(command, (error, stdout, stderr) => {
            if (error !== null) {
                result = {
                    "status": "error",
                    "description": String(error), //.replaceAll('\r','').replaceAll('\n','')
                    "stderr": String(stderr)
                }
            }
            else{
                result = {
                    "status": "success",
                    "description": String(stdout)
                }
            }
            resolve(result)
        })
    })
}

function P_RESTART(site,service_name){
    let service_type = (service_name == "w3svc") ? "iis" : "app_service";
    let restart_wait_time = (service_type == "iis") ? 6 : 15; //seconds
    let restart_count = site_state_variables[site_state_variables.findIndex(element => element.uri == site.uri)].restart_count[service_type];
    let machine_name = String.raw`\\${site.hostname}`;
    return new Promise( async (resolve,reject) => {
        var check_service = await runCMD(`SC \\\\${site.hostname} QUERYEX ${service_name} | FIND "STATE" | FIND /v "RUNNING" > NUL && (echo 0) || (echo 1)`)
        if(check_service.status == "success" && Number(check_service.description) == 1){ //RUNNING
            // @notice Max restart for IIS is 2 times
            if(restart_count <= 2 || service_type == "app_service"){
                let stop_service = await runCMD(`SC ${machine_name} STOP ${service_name}`)
                if(stop_service.status == "success"){
                    log(`Service for [${site.hostname}] was stopped`, stop_service.description)
                    var done = (function wait () { if (!done) setTimeout(wait, 1000) })();

                    // @notice wait some seconds before attempting to start 
                    setTimeout( async () => {
                        let start_service = await runCMD(`SC ${machine_name} START ${service_name}`)
                        if(start_service.status == "success"){
                            log(`Service for [${site.hostname}] has started`, start_service.description)
                            restart_count = ++site_state_variables[site_state_variables.findIndex(element => element.uri == site.uri)].restart_count[service_type]
                            done = true
                            resolve("success")
                        }else{
                            done = true;
                            resolve("failure")
                        }
                    }, 1000 * restart_wait_time)

                }else{
                    resolve("failure")
                }
            }else{
                resolve("success")
            }
        }
        else if(check_service.status == "success" && Number(check_service.description) == 0){ //STOPPED
            let start_service = await runCMD(`SC ${machine_name} START ${service_name}`)
            if(start_service.status == "success"){
                restart_count = ++site_state_variables[site_state_variables.findIndex(element => element.uri == site.uri)].restart_count[service_type]
                log(`Service for [${site.hostname}] has started`, start_service.description)
                resolve("success")
            }
        }else{
            resolve("failure")
        }
    });
}

function restartService(site){
    let uri = site.uri;
    let service = site.window_service_name;
    let failure_count_before_restart = site.failure_count_before_restart;

    let restart_in_progress = site_state_variables.filter(element => element.uri == uri)[0].restart_in_progress;
    let failure_count = site_state_variables.filter(element => element.uri == uri)[0].failure_count;

    if(Number(failure_count) >= Number(failure_count_before_restart)){
        console.log(restart_in_progress) //
        if(!restart_in_progress){
            restart_in_progress = site_state_variables[site_state_variables.findIndex(element => element.uri == uri)].restart_in_progress = true;
            failure_count = site_state_variables[site_state_variables.findIndex(element => element.uri == uri)].failure_count = 0; //reset failure count

            let P_IIS = P_RESTART(site,'w3svc')
            let P_APP = P_RESTART(site,service)
            var done = (function wait () { if (!done) setTimeout(wait, 1000) })();
            console.log("i got here") //code stopping here after restarting on line 214
            Promise.all([P_IIS,P_APP]).then((returns) => {
                done = true;
                restart_in_progress = site_state_variables[site_state_variables.findIndex(element => element.uri == site.uri)].restart_in_progress = false;
                console.log(returns)
                let all_successful = true;
                for(let i = 0; i<returns.length; i++){
                    if( returns[i].trim().toLowerCase() == "failure" ) {
                        all_successful = false;
                        restartService(site);
                        break;
                    }
                }

                if(all_successful){
                    log(site.hostname + " RESTARTED!!! I DIT IT! \n\n".bright.green);
                    setTimeout( () => { start(); }, 2000)
                }
            });
        }
        else{
            //@notice There is pending restart. @comment Thanks for trying. You were not as fast.
        }
    }else{
        start();
    }
}

function start(){
    hosts.forEach( (host) => {
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

start();