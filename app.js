// @Author Wes Ley
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
                    "description": String(error).replaceAll('\r','').replaceAll('\n',''),
                    "stderr": String(stderr)
                }
            }
            else{
                result = {
                    "status": "success",
                    "description": String(stdout).replaceAll('\r','').replaceAll('\n',''),
                }
            }
            resolve(result)
        })
    })
}

function P_RESTART(site,service_name){
    let service_type = (service_name == "w3svc") ? "iis" : "app_service";
    let restart_wait_time = (service_type == "iis") ? 6 : 60 * 4; //seconds
    let restart_count = site_state_variables[site_state_variables.findIndex(element => element.uri == site.uri)].restart_count[service_type];
    let machine_name = String.raw`\\${site.hostname}`;
    return new Promise( async (resolve,reject) => {
        var check_service = await runCMD(`SC \\\\${site.hostname} QUERYEX ${service_name} | FIND "STATE" | FIND /v "RUNNING" > NUL && (echo 0) || (echo 1)`)
        if(check_service.status == "success" && Number(check_service.description) == 1){ //RUNNING
            // @notice Max restart for IIS is 2 times (from when service restarts)
            if(restart_count <= 2 || service_type == "app_service"){
                let stop_service = await runCMD(`SC ${machine_name} STOP ${service_name}`)
                if(stop_service.status == "success"){
                    log(`Service for [${site.hostname}] was stopped`, stop_service.description)
                    
                    // @notice wait some seconds before attempting to start
                    log(`Waiting for ${restart_wait_time} seconds before restarting...`.yellow)
                    setTimeout( async () => {
                        let start_service = await runCMD(`SC ${machine_name} START ${service_name}`)
                        if(start_service.status == "success"){
                            log(`Service for [${site.hostname}] has started`, start_service.description)
                            restart_count = ++site_state_variables[site_state_variables.findIndex(element => element.uri == site.uri)].restart_count[service_type]

                            resolve("success")
                        }else{
                            resolve("failure.couldnotrestart.successfullystopped")
                        }
                    }, 1000 * restart_wait_time)

                }else{
                    resolve("failure.couldnotstop.alreadystarted")
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
            }else{
                resolve("failure.couldnotstart.alreadystopped")
            }
        }else{
            resolve("failure.unknownreason")
        }
    });
}

function restartService(site){
    return new Promise ( async (resolve, reject) => {
        let uri = site.uri;
        let service = site.window_service_name;
        let failure_count_before_restart = site.failure_count_before_restart;

        let restart_in_progress = site_state_variables.filter(element => element.uri == uri)[0].restart_in_progress;
        let failure_count = site_state_variables.filter(element => element.uri == uri)[0].failure_count;

        if(Number(failure_count) >= Number(failure_count_before_restart)){
            if(!restart_in_progress){
                restart_in_progress = site_state_variables[site_state_variables.findIndex(element => element.uri == uri)].restart_in_progress = true;
                failure_count = site_state_variables[site_state_variables.findIndex(element => element.uri == uri)].failure_count = 0; //reset failure count

                const allRestart = await Promise.all([
                    P_RESTART(site,'w3svc'),
                    P_RESTART(site,service)
                ])
                
                let all_restart_successful = true;
                for(let i = 0; i<allRestart.length; i++){
                    if( allRestart[i].trim().toLowerCase() != "success" ) {
                        all_restart_successful = false;
                        break;
                    }
                }

                restart_in_progress = site_state_variables[site_state_variables.findIndex(element => element.uri == site.uri)].restart_in_progress = false;
                if(all_restart_successful){
                    log(site.hostname + " RESTARTED!!! I DIT IT! \n\n".bright.green);

                    const wait_seconds = 60;
                    log(`Waiting ${wait_seconds} seconds before checking again...`.yellow)
                    setTimeout( function(){
                        resolve({
                            status: 'success',
                            response: 'Service Restarted',
                            data: allRestart
                        })
                    }, wait_seconds * 1000)
                }else{
                    resolve({
                        status: 'failure',
                        response: 'Could not restart the services',
                        data: allRestart
                    })
                }
            }
            else{
                resolve({
                    status: 'failure.restartalreadyinprogress',
                    response: 'Restart already in progress'
                })
            }
        }else{
            resolve({
                status: 'failure.lesscount',
                response: 'Failure Count less than required failures that can occur before restart'
            })
        }
    })
}

function httpGetRequest(host, options, site) {
    return new Promise(function(resolve, reject) {
        var request = http.get(host, options, function(response) {
            if( response.statusCode == 200 ){
                setStatus = 'success'
            }else{
                saveLog({
                    "date": Date(),
                    "msg": `Host is not reachable. Status Code is ${response.statusCode}`
                })
                setStatus = 'failure'
            }

            resolve({
                status: setStatus,
                response,
            })
        });
        
        request.on('timeout', () => {
            var log_msg = `TIMEOUT: Can not reach host ${host}`;
            log(log_msg.red)

            let response = {
                "date": Date(),
                "msg": log_msg
            }

            saveLog(response)
            resolve({
                status: 'error',
                response,
            })
        });

        request.on('error', function(e){
            var log_msg = `ERROR: Can not reach host ${host}`;
            log(log_msg.red)

            let response = {
                "date": Date(),
                "msg": log_msg
            }

            saveLog(response)
            resolve({
                status: 'error',
                response,
            })
        });
        
        request.end()
    });
}

(async function start(){
    var server_check_count = 0;

    for(let i=0; i<hosts.length; i++){
        server_check_count++;
        var host = hosts[i].trim();
        var site = config.sites.filter(element => element.uri.trim() == host)[0];

        const request = await httpGetRequest(host, optionsGET, site)
        if(request.status == 'success'){
            site_state_variables[site_state_variables.findIndex(element => element.uri == site.uri)].failure_count = 0;
            log(`[${site.hostname}] ${host} is alive`.green);

            if(server_check_count >= hosts.length){
                setTimeout( async () => {
                    start()
                }, site.check_interval)
            }
        }else{
            ++site_state_variables[site_state_variables.findIndex(element => element.uri == site.uri)].failure_count;
            log(`[${site.hostname}] ${host} is dead`.red);

            const restart_service = await restartService(site);
            log(restart_service)
            if(server_check_count >= hosts.length){
                setTimeout( async () => {
                    start()
                }, site.check_interval)
            }
            console.log('\r\n')
        }        
    }
})()