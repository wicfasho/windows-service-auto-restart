module.exports = {
  sites: [
    {
        "name": "Apache Tomcat Lucee",
        "uri": "http://localhost/ysr-iis/dashboard",
        "hostname": "WESLEY-PC",  //run "hostname" via cmd/powershell to get
        "window_service_name": "Lucee",
        "check_interval": 1000 * 7, //7 seconds
        "failure_count_before_restart": 3
    }
  ]
};
