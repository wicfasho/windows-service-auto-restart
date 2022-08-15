// @notice Check the current state of the World Wide Web Publishing Service service (for IIS)
var check_iis_service = cp.exec(`SC \\\\${site.hostname} QUERYEX w3svc | FIND "STATE" | FIND /v "RUNNING" > NUL && (echo 0) || (echo 1)`, function (error, stdout, stderr) {
    if (error !== null) {
        console.log('exec error: ' + error);
        setTimeout( () => { start(); }, 2000)
    }
    else{
        //If Service is Stopped/Not Running
        if(stdout.trim() == 0){
        
            let cp_command_w3svc = `SC ${machine_name} STOP w3svc && SC ${machine_name} START w3svc`;
            // @notice If service is not running
            if(stdout.trim() == 0){
                cp_command_w3svc = `SC ${machine_name} START w3svc`;
            }

            // @notice Run Command to Start WWW Pub Service
            // @notice Better than using "iisreset"
            var restart_iis_service = cp.exec(cp_command_w3svc, function (error, stdout, stderr) {
                restart_in_progress = false
                site_state_variables[site_state_variables.findIndex(element => element.uri == uri)].restart_in_progress = false;

                if (error !== null) {
                    console.log(error);
                    setTimeout( () => { start(); }, 2000)
                }else{
                    log("stdout", site.hostname, stdout)
                    log("stderr", site.hostname, stderr)

                    // @notice Check current state of Website Service
                    var check_app_service = cp.exec(`SC \\\\${site.hostname} QUERYEX ${service} | FIND "STATE" | FIND /v "RUNNING" > NUL && (echo 0) || (echo 1)`, function (error, stdout, stderr) {
                        if (error !== null) {
                            console.log('exec error: ' + error);
                            return false;
                        }
                        else{
                            // log("stdout", stdout)
                            // log("stderr", stderr)
                            let cp_command_service = `SC ${machine_name} STOP ${service} && SC ${machine_name} START ${service}`;
                            // @notice Check if service is not running
                            if(stdout.trim() == 0){
                                cp_command_service = `SC ${machine_name} START ${service}`;
                            }

                            // @notice Start Service
                            restart_in_progress = true
                            site_state_variables[site_state_variables.findIndex(element => element.uri == uri)].restart_in_progress = true;

                            var restart_app_service = cp.exec(cp_command_service, function (error, stdout, stderr) {
                                restart_in_progress = false
                                site_state_variables[site_state_variables.findIndex(element => element.uri == uri)].restart_in_progress = false;
                                if (error !== null) {
                                    console.log(error);
                                    setTimeout( () => { restartService(site); }, 5000)
                                }else{

                                    log("stdout", site.hostname, stdout)
                                    log("stderr", site.hostname, stderr)
                                    log("RESTARTED!!! I DIT IT! \n\n".bright.green);
                                    setTimeout( () => { start(); }, 2000)
                                }
                            })
                        }
                    })
                }
            })
        }
    }
})